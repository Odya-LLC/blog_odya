import { createRequire } from 'node:module'

import type { Payload } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { indexNowUrls } from '@/collections/Posts/indexnow'
import {
  classifyIndexNowStatus,
  INDEXNOW_ENDPOINT,
  type IndexNowDeps,
  indexNowDeps,
  indexNowKey,
  indexNowReadiness,
  normalizeIndexNowUrls,
  runIndexNowSubmit,
  submitIndexNow,
} from '@/indexnow'
import { INDEXNOW_RETRY_BACKOFF_MS, INDEXNOW_SUBMIT_TASK } from '@/jobs/constants'
import { ROUTE_RESERVED_SLUGS } from '@/lib/slug'
import { INDEXNOW_KEY_REWRITE } from '@/site/seo/rewrites'

/**
 * IndexNow (OBLOG-57): so'rov formati, javob kodlari, qayta urinish, URL'lar va kalit fayli.
 * Tashqi so'rovlar yo'q — `fetch` soxta.
 */
// Next.js rewrite'lari shu kutubxona bilan moslanadi (tiplari yo'q).
const { pathToRegexp } = createRequire(import.meta.url)('next/dist/compiled/path-to-regexp') as {
  pathToRegexp: (source: string, keys: unknown[]) => RegExp
}

const KEY = 'a1b2c3d4e5f6a7b8c9d0'
const ORIGIN = 'https://blog.odya.uz'
const NOW = Date.parse('2026-09-28T10:00:00Z')

type FetchCall = { url: string; init: RequestInit }

function fakeFetch(statuses: Array<number | Error>) {
  const calls: FetchCall[] = []
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = statuses.shift() ?? 200
    if (next instanceof Error) throw next
    return new Response(null, { status: next })
  }) as typeof fetch
  return { fn, calls }
}

function deps(overrides: Partial<IndexNowDeps> = {}): IndexNowDeps {
  return {
    fetch: fakeFetch([200]).fn,
    key: () => KEY,
    origin: () => ORIGIN,
    indexingAllowed: () => true,
    now: () => NOW,
    ...overrides,
  }
}

function fakePayload() {
  const queued: Array<Record<string, unknown>> = []
  const logs: Array<{ level: string; msg: string }> = []
  const log = (level: string) => (entry: { msg?: string } | string) =>
    logs.push({ level, msg: typeof entry === 'string' ? entry : (entry.msg ?? '') })
  const payload = {
    logger: { info: log('info'), warn: log('warn'), error: log('error'), debug: log('debug') },
    jobs: {
      queue: vi.fn(async (args: Record<string, unknown>) => {
        queued.push(args)
        return { id: queued.length }
      }),
    },
  } as unknown as Payload
  return { payload, queued, logs }
}

const URLS = [`${ORIGIN}/ai/yangi-model`, `${ORIGIN}/kr/ai/yangi-model`]

describe('IndexNow: javob kodlari (indexnow.org/documentation)', () => {
  it('200/202 — qabul; 400/403/422 — qayta urinilmaydi; 429/5xx — qayta urinish', () => {
    expect(classifyIndexNowStatus(200)).toMatchObject({ ok: true, retry: false })
    expect(classifyIndexNowStatus(202)).toMatchObject({ ok: true, retry: false })
    for (const status of [400, 403, 422]) {
      expect(classifyIndexNowStatus(status), String(status)).toMatchObject({
        ok: false,
        retry: false,
      })
    }
    for (const status of [429, 500, 503]) {
      expect(classifyIndexNowStatus(status), String(status)).toMatchObject({
        ok: false,
        retry: true,
      })
    }
  })
})

describe('IndexNow: so‘rov', () => {
  it('POST JSON: host, key, keyLocation (/{key}.txt), urlList', async () => {
    const { fn, calls } = fakeFetch([202])
    const result = await submitIndexNow(
      { urls: URLS, key: KEY, origin: ORIGIN },
      deps({ fetch: fn }),
    )
    expect(result).toMatchObject({ ok: true, status: 202 })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(INDEXNOW_ENDPOINT)
    expect(calls[0]!.init.method).toBe('POST')
    expect(new Headers(calls[0]!.init.headers).get('content-type')).toBe(
      'application/json; charset=utf-8',
    )
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      host: 'blog.odya.uz',
      key: KEY,
      keyLocation: `${ORIGIN}/${KEY}.txt`,
      urlList: URLS,
    })
  })

  it('tarmoq xatosi — status 0, qayta urinish', async () => {
    const { fn } = fakeFetch([new Error('ECONNRESET')])
    const result = await submitIndexNow(
      { urls: URLS, key: KEY, origin: ORIGIN },
      deps({ fetch: fn }),
    )
    expect(result).toMatchObject({ ok: false, status: 0, retry: true })
    expect(result.message).toContain('ECONNRESET')
  })

  it('URL’lar: takrorsiz, faqat https', () => {
    expect(normalizeIndexNowUrls([...URLS, URLS[0], 'http://x.uz/a', 42, null])).toEqual(URLS)
  })
})

describe('IndexNow: sozlama', () => {
  it('kalit formati: 8–128 belgi a-zA-Z0-9-', () => {
    expect(indexNowKey({ key: () => KEY })).toBe(KEY)
    expect(indexNowKey({ key: () => ` ${KEY} ` })).toBe(KEY)
    expect(indexNowKey({ key: () => 'short' })).toBeUndefined()
    expect(indexNowKey({ key: () => 'has space in key' })).toBeUndefined()
    expect(indexNowKey({ key: () => undefined })).toBeUndefined()
  })

  it('kalitsiz / preview / https emas — yuborilmaydi', () => {
    expect(indexNowReadiness(deps())).toEqual({ ok: true, key: KEY, origin: ORIGIN })
    expect(indexNowReadiness(deps({ key: () => undefined }))).toEqual({
      ok: false,
      reason: 'no-key',
    })
    expect(indexNowReadiness(deps({ indexingAllowed: () => false }))).toEqual({
      ok: false,
      reason: 'indexing-disabled',
    })
    expect(indexNowReadiness(deps({ origin: () => 'http://localhost:3000' }))).toEqual({
      ok: false,
      reason: 'not-https',
    })
  })
})

describe('indexnow.submit task (runIndexNowSubmit)', () => {
  it('muvaffaqiyat — sent, qayta navbat yo‘q', async () => {
    const { payload, queued, logs } = fakePayload()
    const { fn, calls } = fakeFetch([200])
    const output = await runIndexNowSubmit(payload, { urls: URLS }, { deps: deps({ fetch: fn }) })
    expect(output).toEqual({ status: 'sent', httpStatus: 200 })
    expect(calls).toHaveLength(1)
    expect(queued).toHaveLength(0)
    expect(logs.some((log) => log.level === 'info' && log.msg.includes('2 ta URL'))).toBe(true)
  })

  it('429 — waitUntil bilan qayta navbat (attempt + 1), oxirgi urinishdan keyin — failed', async () => {
    const { payload, queued } = fakePayload()
    const output = await runIndexNowSubmit(
      payload,
      { urls: URLS, attempt: 0 },
      { deps: deps({ fetch: fakeFetch([429]).fn }) },
    )
    expect(output).toMatchObject({ status: 'retry', httpStatus: 429 })
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({
      task: INDEXNOW_SUBMIT_TASK,
      input: { urls: URLS, attempt: 1 },
      waitUntil: new Date(NOW + INDEXNOW_RETRY_BACKOFF_MS[0]),
    })

    const last = await runIndexNowSubmit(
      payload,
      { urls: URLS, attempt: INDEXNOW_RETRY_BACKOFF_MS.length },
      { deps: deps({ fetch: fakeFetch([503]).fn }) },
    )
    expect(last).toMatchObject({ status: 'failed', httpStatus: 503 })
    expect(queued).toHaveLength(1)
  })

  it('422 / 403 — qayta urinilmaydi, warning', async () => {
    for (const status of [422, 403]) {
      const { payload, queued, logs } = fakePayload()
      const output = await runIndexNowSubmit(
        payload,
        { urls: URLS },
        { deps: deps({ fetch: fakeFetch([status]).fn }) },
      )
      expect(output).toMatchObject({ status: 'failed', httpStatus: status })
      expect(queued).toHaveLength(0)
      expect(logs.some((log) => log.level === 'warn')).toBe(true)
    }
  })

  it('kalit yo‘q — skipped + warning (xato emas), so‘rov yuborilmaydi', async () => {
    const { payload, logs } = fakePayload()
    const { fn, calls } = fakeFetch([200])
    const output = await runIndexNowSubmit(
      payload,
      { urls: URLS },
      { deps: deps({ fetch: fn, key: () => undefined }) },
    )
    expect(output).toEqual({ status: 'skipped', reason: 'no-key' })
    expect(calls).toHaveLength(0)
    expect(logs).toEqual([expect.objectContaining({ level: 'warn' })])
  })

  it('boshqa host URL’lari yuborilmaydi', async () => {
    const { payload } = fakePayload()
    const { fn, calls } = fakeFetch([200])
    const output = await runIndexNowSubmit(
      payload,
      { urls: ['https://example.com/x'] },
      { deps: deps({ fetch: fn }) },
    )
    expect(output).toMatchObject({ status: 'skipped', reason: 'foreign-host' })
    expect(calls).toHaveLength(0)
  })
})

describe('Posts → IndexNow URL’lari (lotin + /kr)', () => {
  const next = { path: '/ai/yangi' }
  const prev = { path: '/ai/eski' }

  it('chop etish — yangi URL’lar; unpublish — eski URL’lar', () => {
    expect(indexNowUrls(null, next, ORIGIN)).toEqual([
      `${ORIGIN}/ai/yangi`,
      `${ORIGIN}/kr/ai/yangi`,
    ])
    expect(indexNowUrls(prev, null, ORIGIN)).toEqual([`${ORIGIN}/ai/eski`, `${ORIGIN}/kr/ai/eski`])
  })

  it('slug/kategoriya o‘zgardi — yangi va eski; o‘zgarmadi — hech narsa', () => {
    expect(indexNowUrls(prev, next, ORIGIN)).toEqual([
      `${ORIGIN}/ai/yangi`,
      `${ORIGIN}/kr/ai/yangi`,
      `${ORIGIN}/ai/eski`,
      `${ORIGIN}/kr/ai/eski`,
    ])
    expect(indexNowUrls(next, { ...next }, ORIGIN)).toEqual([])
    expect(indexNowUrls(null, null, ORIGIN)).toEqual([])
  })
})

describe('IndexNow kalit fayli: /{key}.txt', () => {
  const originalKey = indexNowDeps.key
  afterEach(() => {
    indexNowDeps.key = originalKey
  })

  it('rewrite: faqat kalit formatidagi ildiz .txt fayllar (robots.txt emas)', () => {
    const re = pathToRegexp(INDEXNOW_KEY_REWRITE.source, [])
    expect(re.test(`/${KEY}.txt`)).toBe(true)
    expect(re.test('/robots.txt')).toBe(false)
    expect(re.test(`/kr/${KEY}.txt`)).toBe(false)
    expect(re.test(`/${KEY}.xml`)).toBe(false)
    expect(ROUTE_RESERVED_SLUGS).toContain('indexnow')
  })

  it('kalit mos — 200 text/plain kalitning o‘zi; boshqa kalit yoki sozlanmagan — 404', async () => {
    const { GET } = await import('@/app/(seo)/indexnow/[key]/route')
    const call = (key: string) =>
      GET(new Request(`${ORIGIN}/${key}.txt`), { params: Promise.resolve({ key }) })

    indexNowDeps.key = () => KEY
    const ok = await call(KEY)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await ok.text()).toBe(KEY)
    expect((await call('boshqa-kalit-12345')).status).toBe(404)

    indexNowDeps.key = () => undefined
    expect((await call(KEY)).status).toBe(404)
  })
})
