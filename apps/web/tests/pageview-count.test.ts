import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ArticleHeader } from '@/components/blog/ArticleHeader'
import { formatCompactCount } from '@/lib/format'
import {
  showViewCount,
  VIEW_COUNT_CACHE_CONTROL,
  VIEW_COUNT_MIN,
  viewBeaconScript,
  viewCountFormatterSource,
} from '@/pageviews/beacon'
import { handleViewCountRequest } from '@/pageviews/handler'
import { viewsTag } from '@/site/cache-tags'
import { newsArticleJsonLd } from '@/site/seo/json-ld'

/**
 * OBLOG-72: maqoladagi ko'rishlar soni — chegara, skriptdagi formatlash, `GET /api/views?id=`
 * mantiqi, skript DOM'ni to'ldirishi, `ArticleHeader` va JSON-LD `interactionStatistic`.
 */

function countRequest(query: string): Request {
  return new Request(`https://blog.odya.uz/api/views${query}`)
}

describe('ko‘rishlar soni: chegara va formatlash', () => {
  it('VIEW_COUNT_MIN = 10: undan kam — ko‘rsatilmaydi', () => {
    expect(VIEW_COUNT_MIN).toBe(10)
    expect(showViewCount(9)).toBe(false)
    expect(showViewCount(0)).toBe(false)
    expect(showViewCount(null)).toBe(false)
    expect(showViewCount(undefined)).toBe(false)
    expect(showViewCount(10)).toBe(true)
    expect(showViewCount(1234)).toBe(true)
  })

  it('skriptdagi f(x) — formatCompactCount bilan bir xil (lotin va kirill)', () => {
    const values = [
      0, 9, 10, 999, 1000, 1001, 1099, 1100, 1234, 1950, 9999, 10_000, 12_345, 99_999, 100_000,
      999_999, 1_000_000, 1_050_000, 3_450_000, 12_000_000, 999_999_999,
    ]
    for (const [lang, locale] of [
      ['uz-Latn', 'uz-Latn'],
      ['uz-Cyrl', 'uz-Cyrl'],
    ] as const) {
      const f = new Function('d', `${viewCountFormatterSource};return f`)({
        documentElement: { lang },
      }) as (x: number) => string
      for (const value of values) expect(f(value)).toBe(formatCompactCount(value, locale))
    }
  })

  it('viewsTag', () => {
    expect(viewsTag(42)).toBe('views:42')
  })
})

describe('GET /api/views?id= handler', () => {
  it('chop etilgan post: 200 {views}, CDN keshi, cookie yo‘q', async () => {
    const load = vi.fn(async () => 1234)
    const { response, outcome } = await handleViewCountRequest(countRequest('?id=15'), { load })
    expect(outcome).toBe('ok')
    expect(load).toHaveBeenCalledWith(15)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(VIEW_COUNT_CACHE_CONTROL)
    expect(VIEW_COUNT_CACHE_CONTROL).toBe('public, s-maxage=300, stale-while-revalidate=600')
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await response.json()).toEqual({ views: 1234 })
  })

  it('hali ko‘rilmagan post — 0', async () => {
    const { response } = await handleViewCountRequest(countRequest('?id=3'), {
      load: async () => 0,
    })
    expect(await response.json()).toEqual({ views: 0 })
  })

  it('chop etilmagan / noma’lum — 404 (keshlanadi)', async () => {
    const { response, outcome } = await handleViewCountRequest(countRequest('?id=9'), {
      load: async () => null,
    })
    expect(outcome).toBe('unknown')
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe(VIEW_COUNT_CACHE_CONTROL)
  })

  it('noto‘g‘ri ID — 400 no-store, DB’ga murojaatsiz', async () => {
    const load = vi.fn(async () => 1)
    for (const query of ['', '?id=', '?id=abc', '?id=0', '?id=-1', '?id=1.5', '?id=99999999999']) {
      const { response, outcome } = await handleViewCountRequest(countRequest(query), { load })
      expect(outcome).toBe('invalid')
      expect(response.status).toBe(400)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
    expect(load).not.toHaveBeenCalled()
  })

  it('DB xatosi — 503 no-store, onError', async () => {
    const onError = vi.fn()
    const { response, outcome } = await handleViewCountRequest(countRequest('?id=5'), {
      load: async () => {
        throw new Error('db down')
      },
      onError,
    })
    expect(outcome).toBe('error')
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(onError).toHaveBeenCalled()
  })
})

/** Skript uchun minimal DOM: maqola `[data-pv]`, meta qatori `[data-views]`, raqam `[data-views-n]`. */
function fakeDom(postId: string, serverViews: number, hidden: boolean) {
  const number = { textContent: String(serverViews) }
  const attrs: Record<string, string> = { 'data-views': String(serverViews) }
  const views = {
    hidden,
    getAttribute: (name: string) => attrs[name] ?? null,
    setAttribute: (name: string, value: unknown) => {
      attrs[name] = String(value)
    },
    querySelector: (selector: string) => (selector === '[data-views-n]' ? number : null),
  }
  const article = { getAttribute: () => postId }
  const selectors: string[] = []
  const doc = {
    hidden: false,
    documentElement: { lang: 'uz-Latn' },
    querySelector: (selector: string) => {
      selectors.push(selector)
      if (selector === '[data-pv]') return article
      if (selector === `[data-pv="${postId}"] [data-views]`) return views
      return null
    },
  }
  return { doc, views, number, attrs, selectors }
}

async function runScript(
  dom: ReturnType<typeof fakeDom>,
  reply: { ok: boolean; body?: unknown } | Error,
) {
  const timers: Array<() => void> = []
  const fetch = vi.fn(async () => {
    if (reply instanceof Error) throw reply
    return { ok: reply.ok, json: async () => reply.body }
  })
  const win: Record<string, unknown> = { fetch }
  const nav = { sendBeacon: vi.fn() }
  new Function('window', 'document', 'navigator', 'setInterval', viewBeaconScript)(
    win,
    dom.doc,
    nav,
    (fn: () => void) => timers.push(fn),
  )
  timers[0]!()
  // fetch → json → DOM: bir necha mikrotask.
  for (let i = 0; i < 5; i++) await Promise.resolve()
  return { fetch, tick: timers[0]! }
}

describe('skript: ko‘rishlar sonini to‘ldirish', () => {
  it('yangi post — bir marta GET, katta qiymat yoziladi va ochiladi', async () => {
    const dom = fakeDom('77', 0, true)
    const { fetch, tick } = await runScript(dom, { ok: true, body: { views: 1234 } })
    expect(fetch).toHaveBeenCalledWith('/api/views?id=77')
    expect(dom.number.textContent).toBe('1,2 ming')
    expect(dom.attrs['data-views']).toBe('1234')
    expect(dom.views.hidden).toBe(false)
    for (let i = 0; i < 10; i++) tick()
    expect(fetch).toHaveBeenCalledTimes(1) // shu post uchun qayta so'ralmaydi
  })

  it('chegaradan kam — yashirin qoladi', async () => {
    const dom = fakeDom('77', 0, true)
    await runScript(dom, { ok: true, body: { views: VIEW_COUNT_MIN - 1 } })
    expect(dom.views.hidden).toBe(true)
    expect(dom.number.textContent).toBe('0')
  })

  it('server qiymatidan kichik (eski CDN javobi) — tegilmaydi', async () => {
    const dom = fakeDom('77', 500, false)
    await runScript(dom, { ok: true, body: { views: 400 } })
    expect(dom.number.textContent).toBe('500')
  })

  it('404 / tarmoq xatosi — jim', async () => {
    const notFound = fakeDom('77', 0, true)
    await runScript(notFound, { ok: false })
    expect(notFound.views.hidden).toBe(true)
    const failed = fakeDom('77', 0, true)
    await runScript(failed, new Error('offline'))
    expect(failed.views.hidden).toBe(true)
  })
})

describe('ArticleHeader: ko‘rishlar qatori', () => {
  const base = {
    category: { slug: 'texnologiyalar', name: 'Texnologiyalar', href: '/texnologiyalar' },
    title: 'Sarlavha',
    publishedAt: '2026-10-01T10:00:00.000Z',
    readingTime: 3,
  }

  it('chegaradan yuqori — ko‘rinadi: "1,2 ming marta oʻqildi" / "1,2 минг марта ўқилди"', () => {
    const latn = renderToStaticMarkup(
      createElement(ArticleHeader, { ...base, locale: 'uz-Latn', views: 1234 }),
    )
    expect(latn).toMatch(/<p data-views="1234"[^>]*>/)
    expect(latn).not.toMatch(/<p data-views="1234"[^>]*hidden/)
    expect(latn).toContain('<span data-views-n="">1,2 ming</span> <span>marta oʻqildi</span>')
    const cyrl = renderToStaticMarkup(
      createElement(ArticleHeader, { ...base, locale: 'uz-Cyrl', views: 1234 }),
    )
    expect(cyrl).toContain('<span data-views-n="">1,2 минг</span> <span>марта ўқилди</span>')
  })

  it('chegaradan kam — joyi bor, lekin yashirin (skript ochadi)', () => {
    const html = renderToStaticMarkup(
      createElement(ArticleHeader, { ...base, locale: 'uz-Latn', views: 3 }),
    )
    expect(html).toMatch(/<p data-views="3"[^>]*hidden=""/)
  })

  it('views berilmagan (maket) — qator yo‘q', () => {
    const html = renderToStaticMarkup(createElement(ArticleHeader, { ...base, locale: 'uz-Latn' }))
    expect(html).not.toContain('data-views')
  })
})

describe('NewsArticle JSON-LD: interactionStatistic', () => {
  const input = {
    locale: 'uz-Latn' as const,
    path: '/texnologiyalar/sarlavha',
    headline: 'Sarlavha',
    images: ['https://blog.odya.uz/a.jpg'],
    datePublished: '2026-10-01T10:00:00.000Z',
    authors: [],
    origin: 'https://blog.odya.uz',
  }

  it('readCount bor — InteractionCounter / ReadAction', () => {
    expect(newsArticleJsonLd({ ...input, readCount: 1234 }).interactionStatistic).toEqual({
      '@type': 'InteractionCounter',
      interactionType: { '@type': 'ReadAction' },
      userInteractionCount: 1234,
    })
  })

  it('readCount yo‘q / 0 — maydon yo‘q', () => {
    expect(newsArticleJsonLd(input)).not.toHaveProperty('interactionStatistic')
    expect(newsArticleJsonLd({ ...input, readCount: 0 })).not.toHaveProperty('interactionStatistic')
  })
})
