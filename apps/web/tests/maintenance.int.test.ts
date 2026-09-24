import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { runAlertChecks } from '@/jobs/alerts'
import { MAINTENANCE_CLEANUP_TASK, SCRAPE_ITEM_WORKFLOW, SCRAPE_QUEUE } from '@/jobs/constants'
import { enqueueDailyCleanup } from '@/jobs/scheduler'
import { scrapeDeps } from '@/jobs/scrapeDeps'
import { mergeScrapingStats, readScrapingStats } from '@/jobs/stats'
import { runCleanup } from '@/jobs/tasks/maintenanceCleanup'
import type { ScrapedItem, Source } from '@/payload-types'
import { MemoryArchiveStorage } from '@/scraping/archive'
import { hashUrl } from '@/scraping/url'
import { seed } from '@/seed'

import {
  as,
  createTestCategory,
  createTestUsers,
  deleteTestContent,
  testSlug,
} from './helpers/content'
import { deleteTestUsers, initTestPayload } from './helpers/payload'

/**
 * M2-03 (OBLOG-17) Postgres bilan:
 * - `scrapeItem` workflow: extract → `item.dedupe` → `item.classify` — bir yangilik ikki manbada
 *   bitta `clusterId`, score va kategoriya; aniq dublikat — `duplicate`; muharrir holati saqlanadi;
 * - `maintenance.cleanup`: eskirgan matn, rad etilganlar, post versiyalari, DB/R2 hajmi;
 * - kunlik navbat (idempotent) va ogohlantirishlar (takrorlanmaslik) — soxta Telegram bilan.
 */

let payload: Payload
const originalScrapeDeps = { ...scrapeDeps }
const DAY = 24 * 60 * 60_000

function db() {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

async function sourceBySlug(slug: string): Promise<Source> {
  const { docs } = await payload.find({
    collection: 'sources',
    where: { slug: { equals: slug } },
    depth: 0,
    limit: 1,
  })
  return docs[0]!
}

async function categoryId(slug: string): Promise<number> {
  const { docs } = await payload.find({
    collection: 'categories',
    where: { slug: { equals: slug } },
    depth: 0,
    limit: 1,
  })
  return docs[0]!.id
}

async function getItem(id: number): Promise<ScrapedItem> {
  return payload.findByID({ collection: 'scraped-items', id, depth: 0 })
}

const STORY_PARAGRAPHS = [
  'OpenAI on Tuesday announced a new family of reasoning models that the company says cut the cost of running complex agent workflows roughly in half while making fewer factual mistakes.',
  'The models, available through the API starting today, are aimed at developers who build long running assistants that browse the web, write and test code, and operate other software on behalf of users.',
  'According to the company, the larger model scored higher than any previous release on internal benchmarks for software engineering and scientific reasoning, while the smaller model is designed for high volume tasks such as customer support and document processing.',
  'OpenAI said both models were trained with a new safety pipeline that teaches them to refuse clearly harmful requests and to explain uncertainty instead of guessing.',
  'Pricing starts at two dollars per million input tokens for the smaller model. Enterprise customers will get access to higher rate limits next month, and the models will roll out to ChatGPT subscribers over the coming weeks, the company said in a blog post.',
]

const OTHER_STORY = [
  'Valve has confirmed the dates for the next Counter-Strike 2 Major, which will be held in Europe next spring with sixteen teams in the final stage.',
  'The tournament organizer said tickets for the playoff arena will go on sale in December, and that the prize pool will again be one and a quarter million dollars. Regional qualifiers start in January.',
]

const html = (paragraphs: string[]) => paragraphs.map((p) => `<p>${p}</p>`).join('\n')

/** `feed.poll` yaratadigan kabi element (rss_only manba) + navbatdagi `scrapeItem` job'i. */
async function enqueueRssItem(
  slug: string,
  options: { url: string; title: string; contentHtml: string; feedIndex?: number },
): Promise<ScrapedItem> {
  const source = await sourceBySlug(slug)
  const feed = source.feeds![options.feedIndex ?? 0]!
  const normalized = hashUrl(options.url)!
  const item = await payload.create({
    collection: 'scraped-items',
    depth: 0,
    data: {
      source: source.id,
      status: 'pending',
      title: options.title,
      url: options.url,
      canonicalUrl: normalized.url,
      urlHash: normalized.hash,
      publishedAt: new Date().toISOString(),
      language: source.language,
      excerpt: options.contentHtml.replace(/<[^>]+>/g, ' ').slice(0, 300),
      suggestedCategory: typeof feed.mapsTo === 'number' ? feed.mapsTo : feed.mapsTo?.id,
      fetchMeta: { feedUrl: feed.url, feedCategory: feed.feedCategory },
    },
  })
  await payload.jobs.queue({
    workflow: SCRAPE_ITEM_WORKFLOW,
    input: { scrapedItemId: item.id, contentHtml: options.contentHtml },
  })
  return item
}

async function runScrapeQueue() {
  const run = await payload.jobs.run({ queue: SCRAPE_QUEUE, limit: 20, silent: true })
  return Object.values(run.jobStatus ?? {}).map((s) => s.status)
}

async function clearScraping() {
  await payload.delete({
    collection: 'payload-jobs',
    where: {
      or: [
        { workflowSlug: { equals: SCRAPE_ITEM_WORKFLOW } },
        { taskSlug: { equals: MAINTENANCE_CLEANUP_TASK } },
      ],
    },
  })
  await payload.delete({ collection: 'scraped-items', where: { id: { exists: true } } })
}

describe('M2-03: dedupe, klassifikatsiya, tozalash, ogohlantirishlar', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await seed(payload)
    scrapeDeps.storage = new MemoryArchiveStorage()
  })

  beforeEach(async () => {
    await clearScraping()
  })

  afterAll(async () => {
    Object.assign(scrapeDeps, originalScrapeDeps)
    scrapeDeps.storage = undefined
    await clearScraping()
    await deleteTestContent(payload)
    await deleteTestUsers(payload)
    await mergeScrapingStats(payload, { alerts: {} })
    await payload?.db?.destroy?.()
  })

  describe('scrapeItem: extract → dedupe → classify', () => {
    it('bir yangilik ikki manbada — bitta clusterId; boshqa yangilik — alohida; score va kategoriya', async () => {
      const verge = await enqueueRssItem('the-verge', {
        url: 'https://www.theverge.com/ai/100/openai-reasoning-models',
        title: 'OpenAI launches cheaper reasoning models',
        contentHtml: html(STORY_PARAGRAPHS),
      })
      // TechCrunch: qayta nashr — boshqa sarlavha, bir gap qo'shilgan, formatlash farqli.
      const techcrunch = await enqueueRssItem('techcrunch', {
        url: 'https://techcrunch.com/2026/09/24/openai-new-reasoning-models/',
        title: 'OpenAI launches new cheaper reasoning models',
        contentHtml: `<div>${html([...STORY_PARAGRAPHS, 'The company did not share more details.'])}</div>`,
      })
      const other = await enqueueRssItem('the-verge', {
        url: 'https://www.theverge.com/games/200/cs2-major-dates',
        title: 'Valve confirms next Counter-Strike 2 Major',
        contentHtml: html(OTHER_STORY),
        feedIndex: 3, // Games
      })

      expect(await runScrapeQueue()).toEqual(['success', 'success', 'success'])

      const [a, b, c] = await Promise.all([verge, techcrunch, other].map((i) => getItem(i.id)))
      for (const doc of [a, b, c]) {
        expect(doc.status).toBe('scraped')
        expect(doc.contentHash).toMatch(/^[0-9a-f]{16}$/)
        expect(doc.clusterId).toBeTruthy()
        expect(doc.score).toBeGreaterThan(0)
        expect(doc.score).toBeLessThanOrEqual(100)
      }
      expect(b.clusterId).toBe(a.clusterId)
      expect(c.clusterId).not.toBe(a.clusterId)

      // Kategoriya: AI feedlari → suniy-intellekt; Games bo'lim feedi (10) — kibersport kalit
      // so'zlari (cap 10) uni yengolmaydi, teng bo'lsa feed mapping'i qoladi.
      const ai = await categoryId('suniy-intellekt')
      expect(a.suggestedCategory).toBe(ai)
      expect(b.suggestedCategory).toBe(ai)
      expect(c.suggestedCategory).toBe(await categoryId('oyinlar'))

      // Klasterga ikkinchi bo'lib qo'shilgan element klaster bonusini oladi.
      const meta = (doc: ScrapedItem) =>
        (doc.fetchMeta as { classify: { clusterSize: number; score: { cluster: number } } })
          .classify
      // (Parallel ishlasa, ikkalasi ham klassifikatsiyada klasterni 2 ta deb ko'rishi mumkin.)
      const sizes = [a, b].map((doc) => meta(doc).clusterSize)
      expect(Math.max(...sizes)).toBe(2)
      const second = [a, b].find((doc) => meta(doc).clusterSize === 2)!
      expect(meta(second).score.cluster).toBe(5)
      expect(meta(c).clusterSize).toBe(1)
      expect(
        await payload.count({
          collection: 'payload-jobs',
          where: { workflowSlug: { equals: SCRAPE_ITEM_WORKFLOW } },
        }),
      ).toMatchObject({ totalDocs: 0 })
    })

    it('aniq dublikat (o‘sha manba, boshqa URL) — status = duplicate', async () => {
      const original = await enqueueRssItem('the-verge', {
        url: 'https://www.theverge.com/ai/300/story',
        title: 'OpenAI launches cheaper reasoning models',
        contentHtml: html(STORY_PARAGRAPHS),
      })
      await runScrapeQueue()
      const copy = await enqueueRssItem('the-verge', {
        url: 'https://www.theverge.com/ai/300/story-updated',
        title: 'OpenAI launches cheaper reasoning models',
        contentHtml: html(STORY_PARAGRAPHS),
      })
      await runScrapeQueue()

      const [a, b] = await Promise.all([getItem(original.id), getItem(copy.id)])
      expect(a.status).toBe('scraped')
      expect(b.status).toBe('duplicate')
      expect(b.clusterId).toBe(a.clusterId)
      expect(b.contentHash).toBe(a.contentHash)
    })

    it('muharrir qoralamaga olgan element — kategoriya va holat o‘zgarmaydi, klaster/score yoziladi', async () => {
      const editorCategory = await categoryId('startaplar')
      const item = await enqueueRssItem('the-verge', {
        url: 'https://www.theverge.com/ai/400/story',
        title: 'OpenAI launches cheaper reasoning models',
        contentHtml: html(STORY_PARAGRAPHS),
      })
      await payload.update({
        collection: 'scraped-items',
        id: item.id,
        data: { status: 'drafted', suggestedCategory: editorCategory },
      })
      await runScrapeQueue()

      const doc = await getItem(item.id)
      expect(doc.status).toBe('drafted')
      expect(doc.suggestedCategory).toBe(editorCategory)
      expect(doc.clusterId).toBeTruthy()
      expect(doc.contentHash).toBeTruthy()
      expect(doc.score).toBeGreaterThan(0)
    })
  })

  describe('maintenance.cleanup', () => {
    const now = Date.now()

    async function item(
      name: string,
      data: Partial<ScrapedItem>,
      backdate: { createdDaysAgo?: number; handledDaysAgo?: number } = {},
    ): Promise<number> {
      const source = await sourceBySlug('the-verge')
      const url = `https://www.theverge.com/cleanup/${name}-${Date.now()}`
      const doc = await payload.create({
        collection: 'scraped-items',
        depth: 0,
        data: {
          source: source.id,
          url,
          urlHash: hashUrl(url)!.hash,
          title: name,
          status: 'scraped',
          extractedText: `Matn: ${name}`,
          ...data,
        },
      })
      if (backdate.createdDaysAgo) {
        const at = new Date(now - backdate.createdDaysAgo * DAY).toISOString()
        await db().execute(
          sql`UPDATE "scraped_items" SET "created_at" = ${at}::timestamptz, "updated_at" = ${at}::timestamptz WHERE "id" = ${doc.id}`,
        )
      }
      if (backdate.handledDaysAgo) {
        const at = new Date(now - backdate.handledDaysAgo * DAY).toISOString()
        await db().execute(
          sql`UPDATE "scraped_items" SET "handled_at" = ${at}::timestamptz WHERE "id" = ${doc.id}`,
        )
      }
      return doc.id
    }

    async function versionCount(postId: number): Promise<number> {
      const { rows } = (await db().execute(
        sql`SELECT count(*)::int AS "n" FROM "_posts_v" WHERE "parent_id" = ${postId}`,
      )) as unknown as { rows: { n: number }[] }
      return rows[0]!.n
    }

    it('eskirgan matn, rad etilganlar va eski versiyalar tozalanadi; DB/R2 hajmi stats’ga yoziladi; takroriy ishga tushirish — o‘zgarishsiz', async () => {
      const oldScraped = await item('old-scraped', {}, { createdDaysAgo: 31 })
      const oldError = await item('old-error', { status: 'error' }, { createdDaysAgo: 40 })
      const oldDrafted = await item('old-drafted', { status: 'drafted' }, { createdDaysAgo: 31 })
      const recent = await item('recent', {}, { createdDaysAgo: 29 })
      const oldRejected = await item(
        'old-rejected',
        { status: 'rejected', rejectReason: 'x' },
        { createdDaysAgo: 40, handledDaysAgo: 31 },
      )
      const recentRejected = await item(
        'recent-rejected',
        { status: 'rejected', rejectReason: 'x' },
        { createdDaysAgo: 40, handledDaysAgo: 5 },
      )

      // Chop etilgan post: 6 ta versiya, 40 kun oldin chop etilgan (+ yangi post — tegilmaydi).
      const { admin } = await createTestUsers(payload)
      const category = await createTestCategory(payload)
      const makePost = async (name: string) => {
        const post = await payload.create({
          collection: 'posts',
          data: {
            title: name,
            slug: testSlug(name),
            category: category.id,
            workflowStatus: 'draft',
          },
          ...as(admin),
        })
        const update = (data: Record<string, unknown>) =>
          payload.update({ collection: 'posts', id: post.id, data, ...as(admin) })
        await update({ workflowStatus: 'in_progress' })
        await update({ workflowStatus: 'review' })
        await update({ _status: 'published' })
        for (let i = 1; i <= 3; i++) await update({ title: `${name} v${i}` })
        return post.id
      }
      const oldPost = await makePost('old-post')
      const newPost = await makePost('new-post')
      expect(await versionCount(oldPost)).toBeGreaterThanOrEqual(6)
      const newPostVersions = await versionCount(newPost)
      const publishedAt = new Date(now - 40 * DAY).toISOString()
      await db().execute(
        sql`UPDATE "posts" SET "published_at" = ${publishedAt}::timestamptz WHERE "id" = ${oldPost}`,
      )
      const { rows: latestBefore } = (await db().execute(
        sql`SELECT "id" FROM "_posts_v" WHERE "parent_id" = ${oldPost} AND "latest" = true`,
      )) as unknown as { rows: { id: number }[] }

      const lister = {
        listPage: async (bucket: string, token?: string) =>
          bucket === 'media'
            ? token
              ? { bytes: 300, objects: 1 }
              : { bytes: 700, objects: 2, nextToken: 'p2' }
            : { bytes: 24, objects: 3 },
      }
      const deps = { now: () => now, lister, buckets: ['media', 'raw'] }

      const output = await runCleanup(payload, deps)
      expect(output.clearedText).toBeGreaterThanOrEqual(2)
      expect(output.deletedRejected).toBeGreaterThanOrEqual(1)
      expect(output.trimmedVersions).toBeGreaterThanOrEqual(3)
      expect(output.dbBytes).toBeGreaterThan(1024 * 1024)
      expect(output).toMatchObject({ r2Bytes: 1024, r2Complete: true })

      expect((await getItem(oldScraped)).extractedText ?? null).toBeNull()
      expect((await getItem(oldScraped)).title).toBe('old-scraped') // metadata qoladi
      expect((await getItem(oldError)).extractedText ?? null).toBeNull()
      expect((await getItem(oldDrafted)).extractedText).toBe('Matn: old-drafted')
      expect((await getItem(recent)).extractedText).toBe('Matn: recent')
      const gone = await payload.findByID({
        collection: 'scraped-items',
        id: oldRejected,
        disableErrors: true,
      })
      expect(gone).toBeNull()
      expect((await getItem(recentRejected)).status).toBe('rejected')

      expect(await versionCount(oldPost)).toBe(3)
      expect(await versionCount(newPost)).toBe(newPostVersions)
      const { rows: latestAfter } = (await db().execute(
        sql`SELECT "id" FROM "_posts_v" WHERE "parent_id" = ${oldPost} AND "latest" = true`,
      )) as unknown as { rows: { id: number }[] }
      expect(latestAfter).toEqual(latestBefore)
      // Post hali ham o'qiladi (published holatda).
      const post = await payload.findByID({ collection: 'posts', id: oldPost })
      expect(post.title).toBe('old-post v3')

      const stats = await readScrapingStats(payload)
      expect(stats.db?.bytes).toBe(output.dbBytes)
      expect(stats.r2).toMatchObject({ bytes: 1024, objects: 6, complete: true })
      expect(stats.cleanup?.lastResult).toMatchObject({ clearedText: output.clearedText })

      // Idempotent: ikkinchi ishga tushirish hech narsani o'zgartirmaydi.
      const again = await runCleanup(payload, deps)
      expect(again).toMatchObject({ clearedText: 0, deletedRejected: 0, trimmedVersions: 0 })
    })

    it('kunlik navbat: bir kunda faqat bir marta (idempotent), ertasi kuni yana', async () => {
      await mergeScrapingStats(payload, { cleanup: {} })
      const day1 = Date.parse('2030-01-10T08:00:00Z')

      expect(await enqueueDailyCleanup(payload, day1)).toBe(true)
      // Navbatda tugallanmagan job bor — yangisi qo'yilmaydi.
      expect(await enqueueDailyCleanup(payload, day1 + 10 * 60_000)).toBe(false)
      await payload.delete({
        collection: 'payload-jobs',
        where: { taskSlug: { equals: MAINTENANCE_CLEANUP_TASK } },
      })
      // Job tugagan (o'chirilgan), lekin shu kun allaqachon band — yo'q.
      expect(await enqueueDailyCleanup(payload, day1 + 20 * 60_000)).toBe(false)
      // Parallel chaqiruvlar (ertasi kun) — faqat bittasi navbatga qo'yadi.
      const day2 = day1 + DAY
      const results = await Promise.all([
        enqueueDailyCleanup(payload, day2),
        enqueueDailyCleanup(payload, day2),
        enqueueDailyCleanup(payload, day2),
      ])
      expect(results.filter(Boolean)).toHaveLength(1)
      const { totalDocs } = await payload.count({
        collection: 'payload-jobs',
        where: { taskSlug: { equals: MAINTENANCE_CLEANUP_TASK } },
      })
      expect(totalDocs).toBe(1)
      expect((await readScrapingStats(payload)).cleanup?.enqueuedDate).toBe('2030-01-11')
    })
  })

  describe('ogohlantirishlar', () => {
    it('manba xatosi va DB hajmi: Telegram’ga bir marta, 24 soatdan keyin eslatma, hal bo‘lsa — holat tozalanadi', async () => {
      await mergeScrapingStats(payload, {
        alerts: {},
        db: { bytes: 400 * 1024 * 1024, measuredAt: new Date().toISOString() },
        r2: null,
      })
      // Boshqa testlardan qolgan manba statistikasi natijaga ta'sir qilmasin.
      await payload.update({ collection: 'sources', where: {}, data: { stats: null } })
      const habr = await sourceBySlug('habr')
      await payload.update({
        collection: 'sources',
        id: habr.id,
        data: { stats: { consecutiveFailures: 3, lastError: 'HTTP 503' } },
      })

      const messages: { chat: string; text: string }[] = []
      const fetchImpl: typeof fetch = async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as { chat_id: string; text: string }
        messages.push({ chat: body.chat_id, text: body.text })
        return Response.json({ ok: true })
      }
      let clock = Date.now()
      const deps = { now: () => clock, fetchImpl, telegram: { token: 'test', chatId: '-100500' } }

      const first = await runAlertChecks(payload, { deps })
      expect(first).toMatchObject({ active: 2, sent: 2, logged: 0, failed: 0 })
      expect(messages.map((m) => m.chat)).toEqual(['-100500', '-100500'])
      expect(
        messages.some((m) => m.text.includes('«Habr (Новости)»') && m.text.includes('3 marta')),
      ).toBe(true)
      expect(messages.some((m) => m.text.includes('DB hajmi 400 MB'))).toBe(true)

      // 10 daqiqadan keyin (keyingi pg_cron chaqiruvi) — takror yuborilmaydi.
      clock += 10 * 60_000
      expect(await runAlertChecks(payload, { deps })).toMatchObject({ active: 2, sent: 0 })
      expect(messages).toHaveLength(2)

      // Manba tiklandi — holat kaliti o'chiriladi; DB hali katta — 24 soatdan keyin eslatma.
      await payload.update({
        collection: 'sources',
        id: habr.id,
        data: { stats: { consecutiveFailures: 0 } },
      })
      clock += 24 * 60 * 60_000
      expect(await runAlertChecks(payload, { deps })).toMatchObject({ active: 1, sent: 1 })
      const state = (await readScrapingStats(payload)).alerts ?? {}
      expect(Object.keys(state)).toEqual(['db-size'])
      expect(state['db-size']).toMatchObject({ via: 'telegram' })

      // Token yo'q — faqat log (va baribir takrorlanmaydi).
      await mergeScrapingStats(payload, { alerts: {} })
      const logOnly = { now: () => clock, telegram: {} }
      expect(await runAlertChecks(payload, { deps: logOnly })).toMatchObject({ sent: 0, logged: 1 })
      expect(await runAlertChecks(payload, { deps: logOnly })).toMatchObject({ logged: 0 })
      expect((await readScrapingStats(payload)).alerts?.['db-size']).toMatchObject({ via: 'log' })

      await payload.update({ collection: 'sources', id: habr.id, data: { stats: null } })
      await mergeScrapingStats(payload, { alerts: {}, db: null })
    })
  })
})
