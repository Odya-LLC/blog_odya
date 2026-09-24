import { gzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { DEFAULT_QUEUE, RUN_QUEUES, SCRAPE_QUEUE } from '@/jobs/constants'
import { resolveRunQueues } from '@/jobs/scrapeDeps'
import { isFinalTaskError } from '@/jobs/workflows/scrapeItem'
import {
  archiveKey,
  getHtml,
  gunzipHtml,
  GZIP_CONTENT_TYPE,
  MemoryArchiveStorage,
  putHtml,
} from '@/scraping/archive'
import { USER_AGENT } from '@/scraping/feed'
import { planScrapeWrite } from '@/scraping/itemState'
import { decodeHtml, fetchPage, PageFetchError } from '@/scraping/page'
import {
  evaluateRobots,
  fetchRobots,
  isRobotsEntryFresh,
  ROBOTS_TTL_MS,
  robotsEntryFromResponse,
} from '@/scraping/robots'

/** `item.fetch` / `item.extract` yordamchilari — DB'siz va tarmoqsiz. */

const NOW = Date.parse('2026-09-24T10:00:00.000Z')
const ORIGIN = 'https://habr.com'

const HABR_LIKE_ROBOTS = `User-agent: *
Crawl-delay: 10
Disallow: /search/
Disallow: /*?*utm_

User-agent: OdyaBlogBot
Crawl-delay: 12
Disallow: /ru/companies/
Disallow: /*?*utm_
`

describe('robots.txt', () => {
  const entry = robotsEntryFromResponse(ORIGIN, 200, HABR_LIKE_ROBOTS, NOW)

  it('OdyaBlogBot uchun qoidalar: taqiqlangan yo‘l va utm_ parametrli URL yuklanmaydi', () => {
    expect(evaluateRobots(entry, 'https://habr.com/ru/news/1086074/')).toEqual({
      allowed: true,
      rule: 'parsed',
      crawlDelaySec: 12,
    })
    expect(evaluateRobots(entry, 'https://habr.com/ru/companies/2gis/news/1/').allowed).toBe(false)
    expect(evaluateRobots(entry, 'https://habr.com/ru/news/1/?utm_source=rss').allowed).toBe(false)
  })

  it('boshqa host URL’i — ehtiyot uchun taqiq', () => {
    expect(evaluateRobots(entry, 'https://example.com/ru/news/1/').allowed).toBe(false)
  })

  it.each([
    [404, 'allow-all', true],
    [410, 'allow-all', true],
    [401, 'disallow-all', false],
    [403, 'disallow-all', false],
    [429, 'disallow-all', false],
    [503, 'disallow-all', false],
    [null, 'disallow-all', false],
  ] as const)('HTTP %s → %s', (status, rule, allowed) => {
    const result = robotsEntryFromResponse(ORIGIN, status, null, NOW)
    expect(result.rule).toBe(rule)
    expect(evaluateRobots(result, 'https://habr.com/ru/news/1/').allowed).toBe(allowed)
  })

  it('kesh: 24 soat; vaqtincha xato — 1 soat; boshqa origin — eskirgan', () => {
    expect(isRobotsEntryFresh(entry, ORIGIN, NOW + ROBOTS_TTL_MS - 1)).toBe(true)
    expect(isRobotsEntryFresh(entry, ORIGIN, NOW + ROBOTS_TTL_MS)).toBe(false)
    expect(isRobotsEntryFresh(entry, 'https://www.habr.com', NOW)).toBe(false)
    expect(isRobotsEntryFresh(undefined, ORIGIN, NOW)).toBe(false)

    const unavailable = robotsEntryFromResponse(ORIGIN, 503, null, NOW)
    expect(isRobotsEntryFresh(unavailable, ORIGIN, NOW + 59 * 60_000)).toBe(true)
    expect(isRobotsEntryFresh(unavailable, ORIGIN, NOW + 61 * 60_000)).toBe(false)
    // 403 — doimiy holat, 24 soat keshlanadi.
    const forbidden = robotsEntryFromResponse(ORIGIN, 403, null, NOW)
    expect(isRobotsEntryFresh(forbidden, ORIGIN, NOW + 2 * 3_600_000)).toBe(true)
  })

  it('fetchRobots: o‘z UA bilan so‘raydi; tarmoq xatosi — taqiq', async () => {
    const seen: { url: string; ua: string | null }[] = []
    const ok = await fetchRobots(ORIGIN, {
      now: NOW,
      fetchImpl: async (input, init) => {
        seen.push({ url: String(input), ua: new Headers(init?.headers).get('user-agent') })
        return new Response(HABR_LIKE_ROBOTS, { status: 200 })
      },
    })
    expect(seen).toEqual([{ url: 'https://habr.com/robots.txt', ua: USER_AGENT }])
    expect(ok).toMatchObject({ rule: 'parsed', status: 200, origin: ORIGIN })

    const failed = await fetchRobots(ORIGIN, {
      now: NOW,
      fetchImpl: async () => {
        throw new TypeError('fetch failed')
      },
    })
    expect(failed).toMatchObject({ rule: 'disallow-all', status: null })
    expect(failed.error).toContain('fetch failed')
  })
})

describe('fetchPage', () => {
  const respond = (body: BodyInit | null, init: ResponseInit) => async () =>
    new Response(body, init)

  it('HTML, UA va timeout; kodirovka Content-Type’dan', async () => {
    let ua: string | null = null
    let signal: AbortSignal | null | undefined
    const page = await fetchPage('https://habr.com/ru/news/1/', {
      timeoutMs: 15_000,
      fetchImpl: async (_input, init) => {
        ua = new Headers(init?.headers).get('user-agent')
        signal = init?.signal
        return new Response('<html><body>Привет</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      },
    })
    expect(ua).toBe(USER_AGENT)
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(page).toMatchObject({ httpStatus: 200, charset: 'utf-8' })
    expect(page.html).toContain('Привет')
  })

  it('windows-1251 (meta charset) to‘g‘ri dekodlanadi', () => {
    // "Привет" windows-1251 da.
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('<meta charset="windows-1251"><p>'),
      0xcf,
      0xf0,
      0xe8,
      0xe2,
      0xe5,
      0xf2,
      ...new TextEncoder().encode('</p>'),
    ])
    const { html, charset } = decodeHtml(bytes, 'text/html')
    expect(charset).toBe('windows-1251')
    expect(html).toContain('<p>Привет</p>')
  })

  it.each([
    [404, true],
    [410, true],
    [403, true],
    [429, false],
    [500, false],
    [503, false],
  ])('HTTP %i → permanent=%s', async (status, permanent) => {
    const error = await fetchPage('https://x.test/a', {
      timeoutMs: 1000,
      fetchImpl: respond('x', { status }),
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PageFetchError)
    expect((error as PageFetchError).permanent).toBe(permanent)
    expect((error as PageFetchError).httpStatus).toBe(status)
  })

  it('HTML bo‘lmagan javob — doimiy xato', async () => {
    const error = await fetchPage('https://x.test/a.pdf', {
      timeoutMs: 1000,
      fetchImpl: respond('%PDF', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    }).catch((e: unknown) => e)
    expect(error).toMatchObject({ permanent: true })
  })
})

describe('arxiv (R2)', () => {
  it('kalit sxemasi: raw/{source}/{yyyy-mm}/{id}.html.gz va .clean.html.gz', () => {
    expect(archiveKey('habr', '2026-09-24T10:00:00.000Z', 42, 'raw')).toBe(
      'raw/habr/2026-09/42.html.gz',
    )
    expect(archiveKey('the-verge', new Date('2026-01-01T00:00:00Z'), 7, 'clean')).toBe(
      'raw/the-verge/2026-01/7.clean.html.gz',
    )
  })

  it('gzip bilan yoziladi va o‘qiladi', async () => {
    const storage = new MemoryArchiveStorage()
    const html = '<html><body><p>Салом, дунё!</p></body></html>'
    await putHtml(storage, 'raw/x/2026-09/1.html.gz', html)
    const stored = storage.objects.get('raw/x/2026-09/1.html.gz')!
    expect(stored.contentType).toBe(GZIP_CONTENT_TYPE)
    expect([...stored.body.subarray(0, 2)]).toEqual([0x1f, 0x8b])
    expect(await gunzipHtml(stored.body)).toBe(html)
    expect(await getHtml(storage, 'raw/x/2026-09/1.html.gz')).toBe(html)
    expect(await getHtml(storage, 'raw/x/missing.html.gz')).toBeNull()
    expect(await gunzipHtml(gzipSync(Buffer.from('abc')))).toBe('abc')
  })
})

describe('scrapeItem: navbatlar va retry', () => {
  it('arxiv sozlanmagan bo‘lsa scrape navbati ishga tushirilmaydi', () => {
    expect(RUN_QUEUES).toEqual([DEFAULT_QUEUE, SCRAPE_QUEUE])
    expect(resolveRunQueues(true)).toEqual([DEFAULT_QUEUE, SCRAPE_QUEUE])
    expect(resolveRunQueues(false)).toEqual([DEFAULT_QUEUE])
  })

  it('isFinalTaskError: 3 retry tugagach yakuniy', () => {
    const taskError = (totalTried: number) => ({
      message: 'HTTP 503',
      args: { taskStatus: { complete: false, totalTried }, retriesConfig: { attempts: 3 } },
    })
    expect(isFinalTaskError(taskError(0))).toBe(false)
    expect(isFinalTaskError(taskError(2))).toBe(false)
    expect(isFinalTaskError(taskError(3))).toBe(true)
    // Workflow darajasidagi xato (task'dan tashqarida) — retry yo'q.
    expect(isFinalTaskError(new Error('x'))).toBe(true)
  })
})

describe('planScrapeWrite: muharrir holati saqlanadi', () => {
  const result = { status: 'scraped' as const, error: null, extractedText: 'Matn', wordCount: 1 }

  it('pending / error — job hammasini yozadi', () => {
    expect(planScrapeWrite('pending', result)).toEqual({ kind: 'full', data: result })
    expect(planScrapeWrite('error', result)).toEqual({ kind: 'full', data: result })
  })

  it('drafted — faqat matn/metadata, status va error yozilmaydi', () => {
    expect(planScrapeWrite('drafted', result)).toEqual({
      kind: 'content',
      data: { extractedText: 'Matn', wordCount: 1 },
    })
    expect(planScrapeWrite('drafted', { status: 'error', error: 'HTTP 404' })).toEqual({
      kind: 'skip',
    })
  })

  it('rejected / duplicate / scraped / yo‘q element — hech narsa yozilmaydi', () => {
    for (const status of ['rejected', 'duplicate', 'scraped', undefined]) {
      expect(planScrapeWrite(status, result)).toEqual({ kind: 'skip' })
    }
  })
})
