import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { PopularPosts } from '@/components/blog/PopularPosts'
import type { PostSummary } from '@/components/blog/types'

import { formatCompactCount } from '@/lib/format'
import { VIEW_BEACON_DELAY_SECONDS, viewBeaconScript } from '@/pageviews/beacon'
import {
  markSeen,
  parseSeen,
  serializeSeen,
  VIEW_COOKIE,
  VIEW_COOKIE_MAX_ENTRIES,
  VIEW_DEDUPE_SECONDS,
} from '@/pageviews/dedupe'
import { isBotUserAgent, isPrefetch, isSameOrigin, skipReason } from '@/pageviews/filter'
import { handleViewRequest, parsePostId } from '@/pageviews/handler'
import { pickPopular, type PopularRow, resolvePopular } from '@/pageviews/popular'
import { shiftDate } from '@/pageviews/store'

/** OBLOG-69: ko'rishlar hisoblagichi — filtr, cookie dedupe, handler, reyting, formatlash. */

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const CUBOT =
  'Mozilla/5.0 (Linux; Android 12; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'

function viewRequest(
  body: string,
  headers: Record<string, string> = {},
  url = 'https://blog.odya.uz/api/views',
): Request {
  return new Request(url, {
    method: 'POST',
    body,
    headers: {
      'user-agent': CHROME,
      'content-type': 'text/plain;charset=UTF-8',
      host: new URL(url).host,
      origin: new URL(url).origin,
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
  })
}

describe('bot filtri', () => {
  it('oddiy brauzerlar — bot emas (Cubot telefoni ham)', () => {
    expect(isBotUserAgent(CHROME)).toBe(false)
    expect(isBotUserAgent(IPHONE)).toBe(false)
    expect(isBotUserAgent(CUBOT)).toBe(false)
  })

  it.each([
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'TelegramBot (like TwitterBot)',
    'WhatsApp/2.23.20.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36 Chrome-Lighthouse',
    'curl/8.4.0',
    'python-requests/2.31.0',
    'Go-http-client/2.0',
    'Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)',
    'OdyaBlogBot/1.0 (+https://blog.odya.uz/bot)',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
    'Slackbot-LinkExpanding 1.0',
    'Google-InspectionTool/1.0',
  ])('bot: %s', (ua) => {
    expect(isBotUserAgent(ua)).toBe(true)
  })

  it('bo‘sh UA — bot', () => {
    expect(isBotUserAgent('')).toBe(true)
    expect(isBotUserAgent(null)).toBe(true)
    expect(isBotUserAgent('   ')).toBe(true)
  })

  it('prefetch/prerender sarlavhalari', () => {
    expect(isPrefetch(new Headers({ purpose: 'prefetch' }))).toBe(true)
    expect(isPrefetch(new Headers({ 'sec-purpose': 'prefetch;prerender' }))).toBe(true)
    expect(isPrefetch(new Headers())).toBe(false)
  })

  it('begona sayt: Sec-Fetch-Site yoki Origin xosti mos emas', () => {
    expect(isSameOrigin(viewRequest('1'))).toBe(true)
    expect(isSameOrigin(viewRequest('1', { 'sec-fetch-site': 'cross-site' }))).toBe(false)
    expect(isSameOrigin(viewRequest('1', { 'sec-fetch-site': 'same-site' }))).toBe(false)
    expect(
      isSameOrigin(viewRequest('1', { 'sec-fetch-site': '', origin: 'https://evil.example' })),
    ).toBe(false)
    expect(isSameOrigin(viewRequest('1', { 'sec-fetch-site': '', origin: 'null' }))).toBe(false)
    // Sarlavhalarsiz (eski brauzer, server-server) — ruxsat.
    expect(isSameOrigin(viewRequest('1', { 'sec-fetch-site': '', origin: '' }))).toBe(true)
    // Vercel: `x-forwarded-host` ustun.
    expect(
      isSameOrigin(
        viewRequest('1', {
          host: 'internal.vercel.app',
          'x-forwarded-host': 'blog.odya.uz',
          'sec-fetch-site': '',
        }),
      ),
    ).toBe(true)
  })

  it('skipReason', () => {
    expect(skipReason(viewRequest('1'))).toBeNull()
    expect(skipReason(viewRequest('1', { 'user-agent': 'curl/8' }))).toBe('bot')
    expect(skipReason(viewRequest('1', { purpose: 'prefetch' }))).toBe('prefetch')
    expect(skipReason(viewRequest('1', { 'sec-fetch-site': 'cross-site' }))).toBe('cross-site')
  })
})

describe('dedupe cookie', () => {
  const now = 1_800_000_000

  it('parse: muddati o‘tganlar va buzilgan qismlar tashlanadi', () => {
    const header = `theme=dark; ${VIEW_COOKIE}=12-${now + 60}_7-${now - 1}_x-1_99-${now + 5}abc_5-${now + 10}`
    const seen = parseSeen(header, now)
    expect([...seen.keys()].sort()).toEqual([12, 5])
    expect(parseSeen(null, now).size).toBe(0)
    expect(parseSeen('other=1', now).size).toBe(0)
  })

  it('mark + serialize: 30 daqiqa, HttpOnly, faqat /api/views', () => {
    const seen = markSeen(new Map(), 42, now)
    expect(seen.get(42)).toBe(now + VIEW_DEDUPE_SECONDS)
    const cookie = serializeSeen(seen, now, true)
    expect(cookie).toBe(
      `${VIEW_COOKIE}=42-${now + VIEW_DEDUPE_SECONDS}; Path=/api/views; Max-Age=${VIEW_DEDUPE_SECONDS}; HttpOnly; SameSite=Strict; Secure`,
    )
    expect(serializeSeen(seen, now, false)).not.toContain('Secure')
    // Round-trip
    expect(parseSeen(cookie.split(';')[0], now + 10).has(42)).toBe(true)
    expect(parseSeen(cookie.split(';')[0], now + VIEW_DEDUPE_SECONDS).has(42)).toBe(false)
  })

  it('ko‘pi bilan VIEW_COOKIE_MAX_ENTRIES ta (eng yangilari)', () => {
    let seen = new Map<number, number>()
    for (let id = 1; id <= VIEW_COOKIE_MAX_ENTRIES + 10; id++) seen = markSeen(seen, id, now + id)
    expect(seen.size).toBe(VIEW_COOKIE_MAX_ENTRIES)
    expect(seen.has(1)).toBe(false)
    expect(seen.has(VIEW_COOKIE_MAX_ENTRIES + 10)).toBe(true)
  })
})

describe('POST /api/views handler', () => {
  it('post ID: matn yoki JSON; noto‘g‘ri — null', () => {
    expect(parsePostId('123')).toBe(123)
    expect(parsePostId(' 7 ')).toBe(7)
    expect(parsePostId('{"id":5}')).toBe(5)
    expect(parsePostId('{"postId":"6"}')).toBe(6)
    for (const bad of [
      '',
      '0',
      '-1',
      'abc',
      '1.5',
      '{"id":"x"}',
      '{bad',
      '99999999999',
      'x'.repeat(100),
    ]) {
      expect(parsePostId(bad)).toBeNull()
    }
  })

  it('hisoblaydi va cookie qo‘yadi; javob 204 no-store', async () => {
    const record = vi.fn(async () => true)
    const { response, outcome } = await handleViewRequest(viewRequest('15'), {
      record,
      now: () => 1_800_000_000_000,
    })
    expect(outcome).toBe('counted')
    expect(record).toHaveBeenCalledWith(15, null)
    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('set-cookie')).toContain(`${VIEW_COOKIE}=15-`)
  })

  it('30 daqiqa ichida takror — hisoblanmaydi', async () => {
    const record = vi.fn(async () => true)
    const nowSec = 1_800_000_000
    const cookie = `${VIEW_COOKIE}=15-${nowSec + 100}`
    const { outcome, response } = await handleViewRequest(viewRequest('15', { cookie }), {
      record,
      now: () => nowSec * 1000,
    })
    expect(outcome).toBe('duplicate')
    expect(record).not.toHaveBeenCalled()
    expect(response.headers.get('set-cookie')).toBeNull()
    // Boshqa post — hisoblanadi, cookie ikkalasini saqlaydi.
    const other = await handleViewRequest(viewRequest('16', { cookie }), {
      record,
      now: () => nowSec * 1000,
    })
    expect(other.outcome).toBe('counted')
    expect(other.response.headers.get('set-cookie')).toMatch(/bo_pv=(16-\d+_15-\d+|15-\d+_16-\d+);/)
  })

  it('bot, prefetch, begona sayt, noto‘g‘ri tana — DB’ga murojaatsiz 204', async () => {
    const record = vi.fn(async () => true)
    const cases: Array<[Request, string]> = [
      [viewRequest('1', { 'user-agent': 'Googlebot/2.1' }), 'bot'],
      [viewRequest('1', { 'sec-purpose': 'prefetch' }), 'prefetch'],
      [viewRequest('1', { 'sec-fetch-site': 'cross-site' }), 'cross-site'],
      [viewRequest('salom'), 'invalid'],
    ]
    for (const [request, expected] of cases) {
      const { response, outcome } = await handleViewRequest(request, { record })
      expect(outcome).toBe(expected)
      expect(response.status).toBe(204)
    }
    expect(record).not.toHaveBeenCalled()
  })

  it('post topilmadi / DB xatosi — 204, cookie yo‘q (oshkor qilinmaydi)', async () => {
    const unknown = await handleViewRequest(viewRequest('9'), { record: async () => false })
    expect(unknown.outcome).toBe('unknown')
    expect(unknown.response.status).toBe(204)
    expect(unknown.response.headers.get('set-cookie')).toBeNull()
    const onError = vi.fn()
    const failed = await handleViewRequest(viewRequest('9'), {
      record: async () => {
        throw new Error('db down')
      },
      onError,
    })
    expect(failed.outcome).toBe('error')
    expect(failed.response.status).toBe(204)
    expect(onError).toHaveBeenCalled()
  })

  it('http (lokal) — Secure’siz cookie', async () => {
    const { response } = await handleViewRequest(
      viewRequest('3', {}, 'http://localhost:3100/api/views'),
      { record: async () => true },
    )
    expect(response.headers.get('set-cookie')).not.toContain('Secure')
  })
})

describe('Ko‘p o‘qilgan: tanlash', () => {
  const row = (window: PopularRow['window'], id: number, views: number, total = views) => ({
    window,
    id,
    views,
    total,
  })

  it('7 kun yetarli bo‘lsa — 7 kun, ko‘rishlar bo‘yicha, ko‘pi bilan 5 ta', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((id) => row('week', id, id * 10))
    const pick = pickPopular(rows)
    expect(pick?.window).toBe('week')
    expect(pick?.items.map((item) => item.id)).toEqual([6, 5, 4, 3, 2])
  })

  it('teng ko‘rishlar: jami ko‘p, keyin yangi (katta ID)', () => {
    const rows = [row('week', 1, 5, 100), row('week', 2, 5, 50), row('week', 3, 5, 50)]
    expect(pickPopular(rows)?.items.map((item) => item.id)).toEqual([1, 3, 2])
  })

  it('oyna zaxirasi: 7 kun < 3 → 30 kun → butun davr; hech biri — null', () => {
    const rows = [
      row('week', 1, 9),
      row('week', 2, 3),
      row('month', 1, 20),
      row('month', 2, 10),
      row('month', 3, 4),
      row('all', 1, 50),
    ]
    expect(pickPopular(rows)?.window).toBe('month')
    expect(pickPopular(rows.filter((r) => r.window !== 'month'))).toBeNull()
    const all = [row('all', 1, 50), row('all', 2, 40), row('all', 3, 1)]
    expect(pickPopular(all)?.window).toBe('all')
    expect(pickPopular([])).toBeNull()
  })

  it('joriy maqola chiqariladi — yetmasa keyingi oynaga o‘tadi', () => {
    const rows = [
      row('week', 1, 9),
      row('week', 2, 3),
      row('week', 3, 2),
      row('month', 1, 20),
      row('month', 2, 10),
      row('month', 3, 4),
      row('month', 4, 1),
    ]
    expect(pickPopular(rows)?.window).toBe('week')
    const article = pickPopular(rows, { exclude: '2' })
    expect(article?.window).toBe('month')
    expect(article?.items.map((item) => item.id)).toEqual([1, 3, 4])
  })

  it('resolvePopular: kartochkasi yo‘q (ko‘rinmaydigan) postlar hisobga olinmaydi', () => {
    const rows = [row('week', 1, 9), row('week', 2, 5), row('week', 3, 4), row('week', 4, 2)]
    const posts = [{ id: 1 }, { id: 3 }, { id: 4 }]
    const list = resolvePopular(rows, posts)
    expect(list?.items.map((item) => [item.post.id, item.views])).toEqual([
      [1, 9],
      [3, 4],
      [4, 2],
    ])
    expect(resolvePopular(rows, posts, { exclude: 1 })).toBeNull()
  })
})

describe('formatlash va mayoq', () => {
  it.each([
    [0, '0', '0'],
    [7, '7', '7'],
    [999, '999', '999'],
    [1000, '1 ming', '1 минг'],
    [1234, '1,2 ming', '1,2 минг'],
    [1950, '1,9 ming', '1,9 минг'],
    [12_345, '12 ming', '12 минг'],
    [999_999, '999 ming', '999 минг'],
    [1_000_000, '1 mln', '1 млн'],
    [3_450_000, '3,4 mln', '3,4 млн'],
    [-5, '0', '0'],
  ])('%d → %s', (value, latn, cyrl) => {
    expect(formatCompactCount(value, 'uz-Latn')).toBe(latn)
    expect(formatCompactCount(value, 'uz-Cyrl')).toBe(cyrl)
  })

  it('shiftDate', () => {
    expect(shiftDate('2026-10-02', 6)).toBe('2026-09-26')
    expect(shiftDate('2026-03-01', 1)).toBe('2026-02-28')
  })

  it('mayoq skripti: ≤ 400 bayt, sintaksis to‘g‘ri, 5 s ko‘ringach bir marta yuboradi', () => {
    expect(new TextEncoder().encode(viewBeaconScript).length).toBeLessThanOrEqual(400)
    expect(VIEW_BEACON_DELAY_SECONDS).toBe(5)

    const timers: Array<() => void> = []
    const sent: Array<[string, string]> = []
    const element = { getAttribute: () => '77' }
    const doc = { hidden: false, querySelector: () => element as unknown }
    const nav = { sendBeacon: (url: string, body: string) => sent.push([url, body]) }
    const win: Record<string, unknown> = {}
    const run = new Function('window', 'document', 'navigator', 'setInterval', viewBeaconScript)
    run(win, doc, nav, (fn: () => void) => timers.push(fn))
    // Ikkinchi marta ishga tushirilsa (layout qayta chizilgan) — ikkinchi taymer yo'q.
    run(win, doc, nav, (fn: () => void) => timers.push(fn))
    expect(timers).toHaveLength(1)
    const tick = timers[0]!

    doc.hidden = true
    for (let i = 0; i < 10; i++) tick()
    expect(sent).toHaveLength(0) // fon tabi hisoblanmaydi
    doc.hidden = false
    for (let i = 0; i < 4; i++) tick()
    expect(sent).toHaveLength(0)
    tick()
    expect(sent).toEqual([['/api/views', '77']])
    for (let i = 0; i < 20; i++) tick()
    expect(sent).toHaveLength(1) // bir yuklanishda bir marta

    // Client navigatsiya: boshqa maqola — yana 5 s; maqola bo'lmagan sahifa — hech narsa.
    element.getAttribute = () => '78'
    for (let i = 0; i < 5; i++) tick()
    expect(sent.at(-1)).toEqual(['/api/views', '78'])
    doc.querySelector = () => null
    for (let i = 0; i < 10; i++) tick()
    expect(sent).toHaveLength(2)
  })
})

describe('PopularPosts komponenti', () => {
  const post = (id: number): PostSummary => ({
    id,
    title: `Sarlavha ${id}`,
    href: `/texnologiyalar/post-${id}`,
    category: { slug: 'texnologiyalar', name: 'Texnologiyalar', href: '/texnologiyalar' },
    publishedAt: '2026-10-01T10:00:00.000Z',
  })

  it('maʼlumot yetarli emas (null) — hech narsa chizilmaydi', () => {
    expect(
      renderToStaticMarkup(createElement(PopularPosts, { locale: 'uz-Latn', list: null })),
    ).toBe('')
  })

  it('raqamlangan roʻyxat: sarlavha, havola, kategoriya, koʻrishlar soni, oyna', () => {
    const html = renderToStaticMarkup(
      createElement(PopularPosts, {
        locale: 'uz-Cyrl',
        list: {
          window: 'month',
          items: [
            { post: post(1), views: 1234 },
            { post: post(2), views: 56 },
            { post: post(3), views: 7 },
          ],
        },
      }),
    )
    expect(html).toContain('data-testid="popular-posts"')
    expect(html).toContain('data-window="month"')
    expect(html).toContain('Кўп ўқилган')
    expect(html).toContain('Сўнгги 30 кун')
    expect(html).toContain('href="/texnologiyalar/post-1"')
    expect(html).toContain('1,2 минг')
    expect(html.match(/<li/g)).toHaveLength(3)
    expect(html.indexOf('Sarlavha 1')).toBeLessThan(html.indexOf('Sarlavha 2'))
  })
})
