import { describe, expect, it } from 'vitest'

import {
  type AlertSnapshot,
  evaluateAlerts,
  planAlerts,
  recoveryMessages,
  type SourceAlertInfo,
} from '@/jobs/alerts'
import { SOURCE_FAILING_REMINDER_MS } from '@/jobs/constants'
import { isFeedDue } from '@/jobs/scheduler'
import { fetchFeed, FeedHttpError, isCloudflareChallenge } from '@/scraping/feed'
import {
  classifyFeedError,
  FEED_BACKOFF,
  feedBackoffDelayMs,
  nextFeedFailureState,
} from '@/scraping/feedBackoff'

/** OBLOG-53: Cloudflare challenge aniqlash, feed backoff va manba ogohlantirishlari (DB'siz). */

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const CHALLENGE_HTML =
  '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head><body>' +
  '<script>(function(){window._cf_chl_opt={cvId:"3"}})();</script>' +
  '<script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=1"></script></body></html>'

function response(status: number, body: string, headers: Record<string, string>) {
  return new Response(body, { status, statusText: status === 403 ? 'Forbidden' : '', headers })
}

describe('Cloudflare challenge aniqlash', () => {
  it('cf-mitigated: challenge — tanasiz ham challenge', () => {
    expect(isCloudflareChallenge(403, new Headers({ 'cf-mitigated': 'challenge' }), null)).toBe(
      true,
    )
  })

  it('403/503 + server: cloudflare + challenge HTML — challenge', () => {
    const headers = new Headers({ server: 'cloudflare' })
    expect(isCloudflareChallenge(403, headers, CHALLENGE_HTML)).toBe(true)
    expect(isCloudflareChallenge(503, headers, CHALLENGE_HTML)).toBe(true)
  })

  it('oddiy 403 (cloudflare emas yoki challenge HTML yo‘q), 404/500 — challenge emas', () => {
    expect(isCloudflareChallenge(403, new Headers({ server: 'nginx' }), CHALLENGE_HTML)).toBe(false)
    expect(
      isCloudflareChallenge(403, new Headers({ server: 'cloudflare' }), '<h1>Access denied</h1>'),
    ).toBe(false)
    expect(isCloudflareChallenge(404, new Headers({ server: 'cloudflare' }), CHALLENGE_HTML)).toBe(
      false,
    )
  })

  it('fetchFeed: challenge — FeedHttpError(kind: cloudflare); oddiy 403 — kind: http', async () => {
    const challenge = fetchFeed('https://www.hltv.org/rss/news', {
      timeoutMs: 1000,
      fetchImpl: async () =>
        response(403, CHALLENGE_HTML, { server: 'cloudflare', 'cf-mitigated': 'challenge' }),
    })
    await expect(challenge).rejects.toMatchObject({
      name: 'FeedHttpError',
      httpStatus: 403,
      kind: 'cloudflare',
      message: 'HTTP 403 Forbidden (Cloudflare challenge)',
    })

    // Sarlavhasiz: faqat server + HTML belgilari (tana o'qiladi).
    await expect(
      fetchFeed('https://e.com/rss', {
        timeoutMs: 1000,
        fetchImpl: async () => response(403, CHALLENGE_HTML, { server: 'cloudflare' }),
      }),
    ).rejects.toMatchObject({ kind: 'cloudflare' })

    await expect(
      fetchFeed('https://e.com/rss', {
        timeoutMs: 1000,
        fetchImpl: async () => response(403, 'Forbidden', { server: 'cloudflare' }),
      }),
    ).rejects.toMatchObject({ kind: 'http', message: 'HTTP 403 Forbidden' })
  })

  it('fetchFeed: buzuq XML — kind: parse', async () => {
    await expect(
      fetchFeed('https://e.com/rss', {
        timeoutMs: 1000,
        fetchImpl: async () => new Response('<rss><channel><item>', { status: 200 }),
      }),
    ).rejects.toMatchObject({ name: 'FeedHttpError', kind: 'parse' })
  })

  it('classifyFeedError: HTTP turi, timeout, tarmoq', () => {
    expect(classifyFeedError(new FeedHttpError(403, 'x', 'cloudflare'))).toBe('cloudflare')
    expect(classifyFeedError(new FeedHttpError(500, 'x'))).toBe('http')
    expect(classifyFeedError(new DOMException('t', 'TimeoutError'))).toBe('timeout')
    expect(classifyFeedError(new TypeError('fetch failed'))).toBe('network')
  })
})

describe('feed backoff', () => {
  it('oddiy xato: 2 ta — backoffsiz, keyin 2× o‘sadi, 24 soatda cap', () => {
    const delays = Array.from({ length: 12 }, (_, i) => feedBackoffDelayMs('http', i + 1, 15))
    expect(delays).toEqual([
      0,
      0,
      30 * MIN,
      60 * MIN,
      2 * HOUR,
      4 * HOUR,
      8 * HOUR,
      16 * HOUR,
      DAY,
      DAY,
      DAY,
      DAY,
    ])
    expect(feedBackoffDelayMs('timeout', 1_000, 15)).toBe(FEED_BACKOFF.maxDelayMs)
  })

  it('Cloudflare challenge: birinchi xatodayoq kuniga 1 marta', () => {
    expect(feedBackoffDelayMs('cloudflare', 1, 15)).toBe(DAY)
    const requestAt = Date.parse('2026-09-27T10:00:00Z')
    expect(nextFeedFailureState({}, 'cloudflare', { requestAt, intervalMin: 15 })).toEqual({
      failureCount: 1,
      lastErrorKind: 'cloudflare',
      nextPollAt: '2026-09-28T10:00:00.000Z',
    })
    // Keyingi xatolar hisoblagichni oshiradi.
    expect(
      nextFeedFailureState({ failureCount: 1, lastErrorKind: 'http' }, 'http', {
        requestAt,
        intervalMin: 15,
      }),
    ).toEqual({ failureCount: 2, lastErrorKind: 'http', nextPollAt: null })
  })

  it('isFeedDue: backoff muddati kelmaguncha — yo‘q (interval o‘tgan bo‘lsa ham)', () => {
    const now = Date.parse('2026-09-27T12:00:00Z')
    const at = (offset: number) => new Date(now + offset).toISOString()
    const polled = at(-2 * HOUR)
    expect(isFeedDue({ lastPolledAt: polled, nextPollAt: at(3 * HOUR) }, 15, now)).toBe(false)
    expect(isFeedDue({ lastPolledAt: null, nextPollAt: at(3 * HOUR) }, 15, now)).toBe(false)
    // Muddat kelgan (1 daqiqalik slack bilan) yoki o'tgan — ha.
    expect(isFeedDue({ lastPolledAt: polled, nextPollAt: at(30_000) }, 15, now)).toBe(true)
    expect(isFeedDue({ lastPolledAt: polled, nextPollAt: at(-MIN) }, 15, now)).toBe(true)
    expect(isFeedDue({ lastPolledAt: polled, nextPollAt: null }, 15, now)).toBe(true)
    // Nofaol feed — backoffdan qat'i nazar yo'q.
    expect(isFeedDue({ isActive: false, lastPolledAt: null, nextPollAt: null }, 15, now)).toBe(
      false,
    )
  })
})

describe('manba ogohlantirishlari (OBLOG-53)', () => {
  const base: AlertSnapshot = { sources: [], items: [], dbBytes: null, r2Bytes: null }
  const now = Date.parse('2026-09-27T12:00:00Z')
  const hltv = (overrides: Partial<SourceAlertInfo> = {}): SourceAlertInfo => ({
    id: 6,
    name: 'HLTV.org',
    consecutiveFailures: 1,
    lastError: 'https://www.hltv.org/rss/news: HTTP 403 Forbidden (Cloudflare challenge)',
    feeds: [
      {
        url: 'https://www.hltv.org/rss/news',
        isActive: true,
        lastErrorKind: 'cloudflare',
        nextPollAt: new Date(now + DAY).toISOString(),
      },
    ],
    ...overrides,
  })

  it('Cloudflare: birinchi challenge’dayoq bitta aniq xabar, eslatma yo‘q', () => {
    const conditions = evaluateAlerts({ ...base, sources: [hltv()] })
    expect(conditions.map((c) => c.key)).toEqual(['source-blocked:6'])
    const [blocked] = conditions
    expect(blocked!.message).toContain('Cloudflare himoyasi')
    expect(blocked!.message).toContain('fid yopiq')
    expect(blocked!.message).toContain('kuniga 1 marta tekshiriladi')
    expect(blocked!.message).toContain('https://www.hltv.org/rss/news')
    expect(blocked!.message).not.toMatch(/ketma-ket \d+ marta/)

    expect(planAlerts(conditions, {}, now).send).toHaveLength(1)
    const state = {
      'source-blocked:6': {
        sentAt: new Date(now).toISOString(),
        via: 'telegram' as const,
        message: '',
      },
    }
    // 1 kun, 30 kun, 220 marta xato — baribir qayta yuborilmaydi.
    const later = evaluateAlerts({ ...base, sources: [hltv({ consecutiveFailures: 220 })] })
    expect(planAlerts(later, state, now + DAY).send).toEqual([])
    expect(planAlerts(later, state, now + 30 * DAY).send).toEqual([])
  })

  it('nofaol feed Cloudflare holatida bo‘lsa — hisobga olinmaydi', () => {
    const source = hltv({
      consecutiveFailures: 0,
      feeds: [{ url: 'https://x/rss', isActive: false, lastErrorKind: 'cloudflare' }],
    })
    expect(evaluateAlerts({ ...base, sources: [source] })).toEqual([])
  })

  it('oddiy xato: ≥ 3 da xabar (keyingi tekshiruv vaqti bilan), eslatma haftada 1 marta', () => {
    const source = hltv({
      consecutiveFailures: 3,
      lastError: 'https://x/rss: HTTP 500',
      feeds: [
        {
          url: 'https://x/rss',
          isActive: true,
          lastErrorKind: 'http',
          nextPollAt: '2026-09-27T12:30:00.000Z',
        },
      ],
    })
    const conditions = evaluateAlerts({ ...base, sources: [source] })
    expect(conditions.map((c) => c.key)).toEqual(['source-failing:6'])
    expect(conditions[0]!.message).toContain('ketma-ket 3 marta')
    expect(conditions[0]!.message).toContain('Keyingi tekshiruv: 27.09, 17:30 (Toshkent)')
    const sent = (ago: number) => ({
      'source-failing:6': {
        sentAt: new Date(now - ago).toISOString(),
        via: 'telegram' as const,
        message: '',
      },
    })
    expect(planAlerts(conditions, sent(DAY), now).send).toEqual([])
    expect(planAlerts(conditions, sent(SOURCE_FAILING_REMINDER_MS), now).send).toHaveLength(1)
  })

  it('tiklanish: manba ishlasa — "tiklandi"; o‘chirilgan yoki hali xato — xabar yo‘q', () => {
    const healthy = hltv({ consecutiveFailures: 0, feeds: [{ url: 'https://x', isActive: true }] })
    expect(recoveryMessages(['source-blocked:6'], { sources: [healthy] })).toEqual([
      {
        key: 'source-blocked:6',
        message: "«HLTV.org» manbasi tiklandi — fid yana muvaffaqiyatli o'qilmoqda.",
      },
    ])
    // Manba o'chirilgan (snapshot'da yo'q) — jim.
    expect(recoveryMessages(['source-blocked:6'], { sources: [] })).toEqual([])
    // Cloudflare'dan oddiy xatoga o'tdi — tiklanish emas.
    const stillFailing = hltv({
      consecutiveFailures: 2,
      feeds: [{ url: 'https://x', isActive: true, lastErrorKind: 'http' }],
    })
    expect(recoveryMessages(['source-blocked:6'], { sources: [stillFailing] })).toEqual([])
    // Manbaga oid bo'lmagan kalitlar — e'tiborsiz.
    expect(recoveryMessages(['db-size'], { sources: [healthy] })).toEqual([])
  })
})
