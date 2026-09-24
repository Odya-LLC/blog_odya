import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { FEED_POLL_TASK, SCRAPE_ITEM_WORKFLOW, SCRAPE_QUEUE } from '@/jobs/constants'
import { handleJobsRunRequest, type JobsRunResponse } from '@/jobs/runner'
import { scrapeDeps } from '@/jobs/scrapeDeps'
import { feedPollDeps } from '@/jobs/tasks/feedPoll'
import type { Source } from '@/payload-types'
import { seed } from '@/seed'

import { FeedFixtures, SEED_SOURCES } from './helpers/feeds'
import { initTestPayload } from './helpers/payload'

/**
 * `POST /api/jobs/run` → `feed.poll` → `scraped-items` (TZ §3.5, TASKS M2-01).
 * Postgres kerak; feed'lar — lokal fixture'lar (`helpers/feeds.ts`), internetga chiqilmaydi.
 * Domen pauzasi (`rateLimitSec`) testda o'chirilgan (`feedPollDeps.sleep`).
 */
const SECRET = 'test-jobs-secret-0123456789abcdef-0123'
const ACTIVE_SOURCES = SEED_SOURCES.filter((s) => s.isActive).map((s) => s.slug)

let payload: Payload
let fixtures: FeedFixtures
const originalDeps = { ...feedPollDeps }

async function callEndpoint(
  options: { token?: string; overrides?: { deadlineMs?: number; graceMs?: number } } = {},
) {
  const request = new Request('http://localhost:3000/api/jobs/run', {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.token ?? SECRET}` },
  })
  const startedAt = Date.now()
  const response = await handleJobsRunRequest(request, {
    getPayload: async () => payload,
    secret: SECRET,
    overrides: options.overrides,
  })
  return { response, elapsedMs: Date.now() - startedAt }
}

async function runOk(overrides?: { deadlineMs?: number; graceMs?: number }) {
  const { response, elapsedMs } = await callEndpoint({ overrides })
  expect(response.status).toBe(200)
  return { body: (await response.json()) as JobsRunResponse, elapsedMs }
}

async function allSources(): Promise<Source[]> {
  const { docs } = await payload.find({
    collection: 'sources',
    depth: 0,
    pagination: false,
    limit: 0,
  })
  return docs
}

/** Barcha feed'larni "muddati kelgan" qiladi; `clearValidators` — ETag/Last-Modified ham. */
async function makeAllDue(clearValidators: boolean) {
  for (const source of await allSources()) {
    await payload.update({
      collection: 'sources',
      id: source.id,
      depth: 0,
      data: {
        lastRequestAt: null,
        feeds: (source.feeds ?? []).map((feed) => ({
          ...feed,
          lastPolledAt: null,
          ...(clearValidators ? { etag: null, lastModified: null } : {}),
        })),
      },
    })
  }
}

async function countItems(sourceId?: number) {
  const { totalDocs } = await payload.count({
    collection: 'scraped-items',
    where: sourceId ? { source: { equals: sourceId } } : {},
  })
  return totalDocs
}

async function countScrapeJobs() {
  const { totalDocs } = await payload.count({
    collection: 'payload-jobs',
    where: {
      and: [
        { workflowSlug: { equals: SCRAPE_ITEM_WORKFLOW } },
        { queue: { equals: SCRAPE_QUEUE } },
        { completedAt: { exists: false } },
      ],
    },
  })
  return totalDocs
}

describe('jobs endpoint + feed.poll', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await seed(payload)
    await payload.updateGlobal({
      slug: 'scraping-settings',
      data: {
        isEnabled: true,
        jobsBatchLimit: 10,
        jobsDeadlineSec: 40,
        maxNewItemsPerPoll: 30,
        maxItemAgeHours: 72,
      },
    })
    feedPollDeps.sleep = async () => {}
    // Arxivsiz: `scrape` navbati ishga tushirilmaydi — bu test faqat feed.poll'ni tekshiradi
    // (item.fetch/extract — `scrape.int.test.ts`).
    scrapeDeps.storage = null
  })

  beforeEach(() => {
    fixtures = new FeedFixtures()
    feedPollDeps.fetchImpl = fixtures.fetch
  })

  afterAll(async () => {
    Object.assign(feedPollDeps, originalDeps)
    scrapeDeps.storage = undefined
    await payload?.db?.destroy?.()
  })

  it('noto‘g‘ri secret — 401', async () => {
    const { response } = await callEndpoint({ token: 'wrong-secret' })
    expect(response.status).toBe(401)
  })

  it('yangi scraped-items yaratadi (6 faol manba), takroriy chaqiruv dublikat yaratmaydi', async () => {
    // Toza holat: oldingi ishga tushirishlardan qolgan elementlar va job'lar.
    await payload.delete({ collection: 'scraped-items', where: { id: { exists: true } } })
    await payload.delete({
      collection: 'payload-jobs',
      where: {
        or: [
          { taskSlug: { equals: FEED_POLL_TASK } },
          { workflowSlug: { equals: SCRAPE_ITEM_WORKFLOW } },
        ],
      },
    })
    await makeAllDue(true)

    const { body: first } = await runOk()
    expect(first.enqueued).toBe(ACTIVE_SOURCES.length)
    expect(first.done.succeeded).toBeGreaterThanOrEqual(ACTIVE_SOURCES.length)
    expect(first.done.failed).toBe(0)
    expect(first.deadlineReached).toBe(false)
    expect(first.remaining).toBe(0)

    const sources = await allSources()
    let expectedTotal = 0
    for (const source of sources) {
      const count = await countItems(source.id)
      if (ACTIVE_SOURCES.includes(source.slug)) {
        const expected = fixtures.expectedNewItems(source.slug)
        expect(count, source.slug).toBe(expected)
        expect(count, source.slug).toBeGreaterThan(0)
        expectedTotal += expected
        // Faol feed'lar o'qilgan, ETag saqlangan.
        for (const feed of (source.feeds ?? []).filter((f) => f.isActive)) {
          expect(feed.lastStatus, feed.url).toBe(200)
          expect(feed.etag, feed.url).toBe('"v1"')
          expect(feed.lastPolledAt, feed.url).toBeTruthy()
        }
      } else {
        // 3DNews (zaxira) — nofaol, so'rov yuborilmaydi.
        expect(count, source.slug).toBe(0)
      }
    }
    expect(await countItems()).toBe(expectedTotal)
    // Har bir yangi element uchun scrapeItem workflow navbatda (arxivsiz — ishlanmaydi).
    expect(await countScrapeJobs()).toBe(expectedTotal)
    expect(
      fixtures.requests.every((r) => r.headers.get('user-agent')?.startsWith('OdyaBlogBot')),
    ).toBe(true)

    // Habr: utm_* va #fragment olib tashlangan canonical URL, asl URL saqlangan.
    const habr = sources.find((s) => s.slug === 'habr')!
    const { docs: habrItems } = await payload.find({
      collection: 'scraped-items',
      where: { source: { equals: habr.id } },
      depth: 0,
      limit: 1,
    })
    const habrItem = habrItems[0]!
    expect(habrItem.url).toContain('utm_source=')
    expect(habrItem.canonicalUrl).not.toMatch(/utm_|#|\/$/)
    expect(habrItem.urlHash).toMatch(/^[0-9a-f]{64}$/)
    expect(habrItem).toMatchObject({ status: 'pending', language: 'ru' })
    expect(habrItem.suggestedCategory).toBeTruthy()
    expect(habrItem.excerpt).toContain('Description of')

    // 1) Darhol takroriy chaqiruv: pollIntervalMin o'tmagan — hech narsa navbatga qo'yilmaydi.
    const requestsBefore = fixtures.requests.length
    const { body: second } = await runOk()
    expect(second.enqueued).toBe(0)
    expect(fixtures.requests.length).toBe(requestsBefore)
    expect(await countItems()).toBe(expectedTotal)

    // 2) Muddat o'tgan, ETag saqlangan → If-None-Match → 304, yangi element yo'q.
    await makeAllDue(false)
    const { body: third } = await runOk()
    expect(third.enqueued).toBe(ACTIVE_SOURCES.length)
    const conditional = fixtures.requests.slice(requestsBefore)
    expect(conditional.length).toBeGreaterThan(0)
    expect(conditional.every((r) => r.headers.get('if-none-match') === '"v1"')).toBe(true)
    expect(conditional.every((r) => r.headers.get('if-modified-since'))).toBe(true)
    const verge = (await allSources()).find((s) => s.slug === 'the-verge')!
    expect(verge.feeds?.every((f) => f.lastStatus === 304)).toBe(true)
    expect(await countItems()).toBe(expectedTotal)

    // 3) Validatorlarsiz to'liq feed (200) → urlHash bo'yicha dedupe, dublikat yo'q.
    await makeAllDue(true)
    const { body: fourth } = await runOk()
    expect(fourth.done.failed).toBe(0)
    expect(await countItems()).toBe(expectedTotal)
    expect(await countScrapeJobs()).toBe(expectedTotal)

    // 4) Feed'ga yangi maqola qo'shildi → aynan bitta yangi element.
    const ixbtFeed = SEED_SOURCES.find((s) => s.slug === 'ixbt')!.feeds[0]!.url
    fixtures.addItem(ixbtFeed, {
      link: 'https://www.ixbt.com/news/2026/09/24/brand-new.html',
      title: 'Brand new',
      publishedAt: new Date(),
    })
    await makeAllDue(false)
    await runOk()
    expect(await countItems()).toBe(expectedTotal + 1)
    const { totalDocs } = await payload.count({
      collection: 'scraped-items',
      where: { canonicalUrl: { equals: 'https://www.ixbt.com/news/2026/09/24/brand-new.html' } },
    })
    expect(totalDocs).toBe(1)
  })

  it('deadline: osilib qolgan feed’lar bilan ham chaqiruv chegarada tugaydi (< 60 s)', async () => {
    // Javob bermaydigan server: so'rov faqat AbortSignal (timeout) bilan tugaydi.
    feedPollDeps.fetchImpl = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    await makeAllDue(true)
    const before = await countItems()

    const { body, elapsedMs } = await runOk({ deadlineMs: 1_000, graceMs: 4_000 })
    expect(elapsedMs).toBeLessThan(60_000)
    // deadline (1 s) + grace (4 s) + DB yozuvlari.
    expect(elapsedMs).toBeLessThan(10_000)
    expect(body.durationMs).toBeLessThan(10_000)
    expect(body.done.failed).toBe(0)
    expect(await countItems()).toBe(before)

    const verge = (await allSources()).find((s) => s.slug === 'the-verge')!
    const polled = (verge.feeds ?? []).filter((f) => f.lastPolledAt)
    // Birinchi feed timeout bilan tugadi, qolganlari keyingi chaqiruvga qoldi.
    expect(polled).toHaveLength(1)
    expect(polled[0]!.lastError).toBe('Timeout')
    expect((verge.stats as { consecutiveFailures?: number }).consecutiveFailures).toBeGreaterThan(0)
  })
})
