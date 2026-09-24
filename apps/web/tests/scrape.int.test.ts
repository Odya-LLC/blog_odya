import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SCRAPE_ITEM_WORKFLOW, SCRAPE_QUEUE } from '@/jobs/constants'
import { scrapeDeps } from '@/jobs/scrapeDeps'
import type { ScrapedItem, Source } from '@/payload-types'
import { gunzipHtml, GZIP_CONTENT_TYPE, MemoryArchiveStorage } from '@/scraping/archive'
import { hashUrl } from '@/scraping/url'
import { seed } from '@/seed'

import { initTestPayload } from './helpers/payload'

/**
 * `scrapeItem` workflow (`item.fetch` → `item.extract`) Postgres bilan (TASKS M2-02):
 * - robots.txt'da taqiqlangan URL yuklanmaydi (RSS matni ishlatiladi), robots.txt bir marta
 *   so'raladi va DB'da keshlanadi;
 * - domen bo'yicha rate limit (`sources.lastRequestAt`, Crawl-delay), slot sig'masa — keyinga;
 * - raw/clean HTML gzip bilan arxivga (soxta R2) yoziladi, DB'da HTML yo'q;
 * - 404 — retry'siz `error`; 503 — 3 retry'dan keyin `error`.
 * Tarmoq — soxta `fetch` (fixture sahifalar), internetga chiqilmaydi.
 */

const FIXTURES = path.join(__dirname, '__fixtures__', 'scraping')

interface FixtureMeta {
  url: string
  title?: string
  publishedAt?: string
  author?: string
  categories: string[]
  excerpt?: string
  contentHtml?: string
}

function fixture(slug: string, name: string) {
  const dir = path.join(FIXTURES, slug)
  return {
    meta: JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as FixtureMeta,
    html: readFileSync(path.join(dir, `${name}.html`), 'utf8'),
  }
}

const HABR_ROBOTS = `User-agent: *
Disallow: /search/
Disallow: /*?*utm_

User-agent: OdyaBlogBot
Crawl-delay: 12
Disallow: /ru/companies/
Disallow: /*?*utm_
`

/** Soxta tarmoq: URL → javob; barcha so'rovlar yoziladi. */
class FakeWeb {
  readonly requests: string[] = []
  readonly routes = new Map<string, () => Response>()

  page(url: string, html: string) {
    this.routes.set(
      url,
      () =>
        new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    )
  }

  status(url: string, status: number) {
    this.routes.set(url, () => new Response('error', { status }))
  }

  readonly fetch: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    this.requests.push(url)
    const route = this.routes.get(url)
    return route ? route() : new Response('not found', { status: 404 })
  }

  count(url: string) {
    return this.requests.filter((u) => u === url).length
  }
}

let payload: Payload
let web: FakeWeb
let storage: MemoryArchiveStorage
let waits: number[]
const originalDeps = { ...scrapeDeps }

async function sourceBySlug(slug: string): Promise<Source> {
  const { docs } = await payload.find({
    collection: 'sources',
    where: { slug: { equals: slug } },
    depth: 0,
    limit: 1,
  })
  return docs[0]!
}

/** `feed.poll` yaratadigan kabi element + navbatdagi `scrapeItem` job'i. */
async function enqueueItem(slug: string, name: string): Promise<ScrapedItem> {
  const source = await sourceBySlug(slug)
  const { meta, html } = fixture(slug, name)
  const normalized = hashUrl(meta.url)!
  const item = await payload.create({
    collection: 'scraped-items',
    depth: 0,
    data: {
      source: source.id,
      status: 'pending',
      title: meta.title,
      url: meta.url,
      canonicalUrl: normalized.url,
      urlHash: normalized.hash,
      author: meta.author,
      publishedAt: meta.publishedAt,
      language: source.language,
      excerpt: meta.excerpt,
      sourceTags: meta.categories.length ? meta.categories : undefined,
    },
  })
  // rss_only: fixture HTML — RSS'dagi matn; rss_plus_page: RSS description (contentHtml).
  const contentHtml = source.fetchMode === 'rss_plus_page' ? meta.contentHtml : html
  await payload.jobs.queue({
    workflow: SCRAPE_ITEM_WORKFLOW,
    input: { scrapedItemId: item.id, contentHtml },
  })
  return item
}

async function runScrapeQueue() {
  return payload.jobs.run({ queue: SCRAPE_QUEUE, limit: 20, silent: true })
}

async function getItem(id: number): Promise<ScrapedItem> {
  return payload.findByID({ collection: 'scraped-items', id, depth: 0 })
}

async function scrapeJobs() {
  const { docs } = await payload.find({
    collection: 'payload-jobs',
    where: { workflowSlug: { equals: SCRAPE_ITEM_WORKFLOW } },
    depth: 0,
    pagination: false,
  })
  return docs
}

async function resetSource(slug: string, data: Partial<Source> = {}) {
  const source = await sourceBySlug(slug)
  await payload.update({
    collection: 'sources',
    id: source.id,
    depth: 0,
    data: { lastRequestAt: null, robotsCache: null, rateLimitSec: 10, ...data },
  })
}

/** DB'dagi element va job'larda HTML yo'qligini tekshiradi. */
function expectNoHtml(value: unknown) {
  const json = JSON.stringify(value)
  expect(json).not.toMatch(/<(html|body|div|article|p|script)[\s>]/i)
}

describe('scrapeItem: item.fetch → item.extract', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await seed(payload)
  })

  beforeEach(async () => {
    await payload.delete({
      collection: 'payload-jobs',
      where: { workflowSlug: { equals: SCRAPE_ITEM_WORKFLOW } },
    })
    await payload.delete({ collection: 'scraped-items', where: { id: { exists: true } } })
    await resetSource('habr')
    await resetSource('the-verge')

    web = new FakeWeb()
    web.routes.set('https://habr.com/robots.txt', () => new Response(HABR_ROBOTS, { status: 200 }))
    for (const name of ['1', '2', '3']) {
      const { meta, html } = fixture('habr', name)
      web.page(hashUrl(meta.url)!.url, html)
    }
    storage = new MemoryArchiveStorage()
    waits = []
    scrapeDeps.fetchImpl = web.fetch
    scrapeDeps.storage = storage
    scrapeDeps.sleep = async (ms) => {
      waits.push(ms)
    }
  })

  afterAll(async () => {
    Object.assign(scrapeDeps, originalDeps)
    scrapeDeps.fetchImpl = undefined
    scrapeDeps.storage = undefined
    await payload?.db?.destroy?.()
  })

  it('sahifa yuklanadi, robots taqiqlagan URL yuklanmaydi, rss_only — tarmoqsiz; R2 gzip, DB’da HTML yo‘q', async () => {
    const habr1 = await enqueueItem('habr', '1')
    const habr2 = await enqueueItem('habr', '2')
    // /ru/companies/... — robots.txt'da OdyaBlogBot uchun yopiq.
    const habr3 = await enqueueItem('habr', '3')
    const verge = await enqueueItem('the-verge', '1')

    const run = await runScrapeQueue()
    expect(Object.values(run.jobStatus ?? {}).map((s) => s.status)).toEqual(
      Array(4).fill('success'),
    )
    expect(await scrapeJobs()).toHaveLength(0)

    // robots.txt — bir marta, keshlangan.
    expect(web.count('https://habr.com/robots.txt')).toBe(1)
    const habrSource = await sourceBySlug('habr')
    expect(habrSource.robotsCache).toMatchObject({
      'https://habr.com': { rule: 'parsed', status: 200 },
    })
    // Taqiqlangan sahifa so'ralmadi; The Verge (rss_only) — umuman so'rov yo'q.
    const habr3Url = hashUrl(fixture('habr', '3').meta.url)!.url
    expect(habr3Url).toContain('/ru/companies/')
    expect(web.count(habr3Url)).toBe(0)
    expect(web.requests.some((url) => url.includes('theverge.com'))).toBe(false)
    expect(web.requests.every((url) => url.startsWith('https://habr.com/'))).toBe(true)

    // Rate limit: Crawl-delay 12 s > rateLimitSec 10 s — ikkinchi so'rov ~12 s kutadi.
    expect(waits.length).toBeLessThanOrEqual(2)
    const maxWait = Math.max(0, ...waits)
    expect(maxWait).toBeGreaterThan(10_500)
    expect(maxWait).toBeLessThanOrEqual(12_000)
    expect(habrSource.lastRequestAt).toBeTruthy()

    for (const [item, name] of [
      [habr1, '1'],
      [habr2, '2'],
    ] as const) {
      const doc = await getItem(item.id)
      const { meta, html } = fixture('habr', name)
      expect(doc.status).toBe('scraped')
      expect(doc.error ?? null).toBeNull()
      expect(doc.title?.replace(/‑/g, '-')).toBe(meta.title?.replace(/‑/g, '-'))
      expect(doc.author).toBeTruthy()
      expect(doc.publishedAt).toBeTruthy()
      expect(doc.ogImage).toMatch(/^https:\/\/habr\.com\/share\//)
      expect(doc.wordCount).toBeGreaterThan(150)
      expect(doc.extractedText!.length).toBeGreaterThan(500)
      expect(doc.sourceTags?.length).toBeGreaterThan(0)
      expect((doc.fetchMeta as { extract: { method: string } }).extract.method).toBe('readability')

      const month = doc.createdAt.slice(0, 7)
      expect(doc.rawHtmlKey).toBe(`raw/habr/${month}/${doc.id}.html.gz`)
      expect(doc.cleanHtmlKey).toBe(`raw/habr/${month}/${doc.id}.clean.html.gz`)
      const raw = storage.objects.get(doc.rawHtmlKey!)!
      const clean = storage.objects.get(doc.cleanHtmlKey!)!
      for (const object of [raw, clean]) {
        expect(object.contentType).toBe(GZIP_CONTENT_TYPE)
        expect([...object.body.subarray(0, 2)]).toEqual([0x1f, 0x8b])
      }
      expect(await gunzipHtml(raw.body)).toBe(html)
      const cleanHtml = await gunzipHtml(clean.body)
      expect(cleanHtml).toMatch(/^<!doctype html>/)
      expect(cleanHtml).toContain('<article>')
      expect(cleanHtml).not.toMatch(/<script/i)
      expectNoHtml(doc)
    }

    // robots taqiqlagan element — RSS matni bilan.
    const blocked = await getItem(habr3.id)
    expect(blocked.status).toBe('scraped')
    expect(blocked.fetchMeta).toMatchObject({ fetch: { status: 'rss', reason: 'robots' } })
    expect((blocked.fetchMeta as { extract: { method: string } }).extract.method).toBe('rss')
    expect(blocked.extractedText).toBeTruthy()
    expect(storage.objects.has(blocked.rawHtmlKey!)).toBe(true)
    expectNoHtml(blocked)

    // rss_only.
    const vergeDoc = await getItem(verge.id)
    expect(vergeDoc.status).toBe('scraped')
    expect(vergeDoc.fetchMeta).toMatchObject({ fetch: { status: 'rss', reason: 'rss_only' } })
    expect(vergeDoc.rawHtmlKey).toMatch(/^raw\/the-verge\/\d{4}-\d{2}\/\d+\.html\.gz$/)
    expect(vergeDoc.extractedText!.length).toBeGreaterThan(100)
    expectNoHtml(vergeDoc)

    // DB'ga HTML ham, job log'iga ham yozilmagan (job'lar o'chirilgan, arxivda 8 fayl).
    expect(storage.objects.size).toBe(8)
  })

  it('rate limit slot’i task byudjetiga sig‘masa — job keyinga qoldiriladi (sahifa so‘ralmaydi)', async () => {
    const busyUntil = Date.now() + 60_000
    await resetSource('habr', { lastRequestAt: new Date(busyUntil).toISOString() })
    const item = await enqueueItem('habr', '1')

    await runScrapeQueue()

    const pageUrl = hashUrl(fixture('habr', '1').meta.url)!.url
    expect(web.count(pageUrl)).toBe(0)
    expect((await getItem(item.id)).status).toBe('pending')
    const jobs = await scrapeJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.input).toMatchObject({ scrapedItemId: item.id })
    // Keyingi slot: lastRequestAt + max(rateLimitSec, Crawl-delay) = +12 s.
    expect(Date.parse(jobs[0]!.waitUntil!)).toBe(busyUntil + 12_000)
    expect(jobs[0]!.hasError).toBeFalsy()
  })

  it('404 — retry’siz status = error', async () => {
    const { meta } = fixture('habr', '1')
    web.status(hashUrl(meta.url)!.url, 404)
    const item = await enqueueItem('habr', '1')

    await runScrapeQueue()

    const doc = await getItem(item.id)
    expect(doc.status).toBe('error')
    expect(doc.error).toContain('HTTP 404')
    expect(await scrapeJobs()).toHaveLength(0)
    expect(storage.objects.size).toBe(0)
  })

  it('503 — 3 retry (backoff), keyin status = error va scraped-items.error', async () => {
    const { meta } = fixture('habr', '1')
    const pageUrl = hashUrl(meta.url)!.url
    web.status(pageUrl, 503)
    const item = await enqueueItem('habr', '1')

    for (let attempt = 1; attempt <= 4; attempt++) {
      // Rate limit va backoff kutishlarini testda o'tkazib yuboramiz.
      await resetSource('habr', { robotsCache: (await sourceBySlug('habr')).robotsCache })
      await payload.update({
        collection: 'payload-jobs',
        where: { workflowSlug: { equals: SCRAPE_ITEM_WORKFLOW } },
        data: { waitUntil: null },
      })
      await runScrapeQueue()

      const jobs = await scrapeJobs()
      expect(jobs).toHaveLength(1)
      expect(jobs[0]!.totalTried).toBe(attempt)
      const doc = await getItem(item.id)
      if (attempt < 4) {
        expect(jobs[0]!.hasError).toBeFalsy()
        // Backoff: keyingi urinish kelajakda.
        expect(Date.parse(jobs[0]!.waitUntil!)).toBeGreaterThan(Date.now())
        expect(doc.status).toBe('pending')
      } else {
        expect(jobs[0]!.hasError).toBe(true)
        expect(doc.status).toBe('error')
        expect(doc.error).toMatch(/^item\.fetch: .*HTTP 503/)
      }
    }
    expect(web.count(pageUrl)).toBe(4)
  })
})
