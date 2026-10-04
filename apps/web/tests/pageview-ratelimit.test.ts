import { describe, expect, it, vi } from 'vitest'

import { parseEnv } from '@/env.schema'
import { handleViewRequest } from '@/pageviews/handler'
import {
  buildViewGuard,
  clientIp,
  dailyHashKey,
  ipBucket,
  limitKey,
  normalizeIp,
  VIEW_LIMITS_PRUNE_PROBABILITY,
  type ViewGuard,
} from '@/pageviews/ratelimit'

/** OBLOG-71: `/api/views` IP himoyasi — IP aniqlash, /64, kunlik xesh, guard, handler. */

const SECRET = 'x'.repeat(40)
const LIMITS = { perHour: 300, perDay: 1500, perPostHour: 30 }
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
// 2026-10-04 10:15 Toshkent (05:15 UTC).
const NOW = Date.parse('2026-10-04T05:15:00Z')

function guardFor(headers: Record<string, string>, postId = 7, nowMs = NOW): ViewGuard | null {
  return buildViewGuard({
    headers: new Headers({ 'user-agent': CHROME, ...headers }),
    postId,
    nowMs,
    secret: SECRET,
    limits: LIMITS,
  })
}

function viewRequest(headers: Record<string, string> = {}, body = '7'): Request {
  return new Request('https://blog.odya.uz/api/views', {
    method: 'POST',
    body,
    headers: { 'user-agent': CHROME, 'sec-fetch-site': 'same-origin', ...headers },
  })
}

describe('mijoz IP’si', () => {
  it('tartib: x-vercel-forwarded-for → x-real-ip → x-forwarded-for (birinchi qiymat)', () => {
    expect(
      clientIp(
        new Headers({
          'x-vercel-forwarded-for': '203.0.113.9',
          'x-real-ip': '198.51.100.2',
          'x-forwarded-for': '192.0.2.1, 10.0.0.1',
        }),
      ),
    ).toBe('203.0.113.9')
    expect(
      clientIp(new Headers({ 'x-real-ip': '198.51.100.2', 'x-forwarded-for': '192.0.2.1' })),
    ).toBe('198.51.100.2')
    expect(clientIp(new Headers({ 'x-forwarded-for': ' 192.0.2.1 , 10.0.0.1' }))).toBe('192.0.2.1')
    expect(clientIp(new Headers())).toBeNull()
  })

  it('noto‘g‘ri qiymat o‘tkazib yuboriladi, port va qavslar olib tashlanadi', () => {
    expect(
      clientIp(
        new Headers({ 'x-vercel-forwarded-for': 'unknown', 'x-forwarded-for': '192.0.2.1' }),
      ),
    ).toBe('192.0.2.1')
    expect(clientIp(new Headers({ 'x-forwarded-for': 'garbage, 192.0.2.1' }))).toBeNull()
    expect(normalizeIp('192.0.2.1:5678')).toBe('192.0.2.1')
    expect(normalizeIp('[2001:DB8::1]:443')).toBe('2001:db8::1')
    expect(normalizeIp('"192.0.2.1"')).toBe('192.0.2.1')
    expect(normalizeIp('fe80::1%eth0')).toBe('fe80::1')
    expect(normalizeIp('999.1.1.1')).toBeNull()
    expect(normalizeIp('')).toBeNull()
  })
})

describe('IP chelagi (IPv6 — /64)', () => {
  it('IPv4 — o‘zi; IPv4-mapped IPv6 — IPv4', () => {
    expect(ipBucket('192.0.2.1')).toBe('192.0.2.1')
    expect(ipBucket('::ffff:192.0.2.1')).toBe('192.0.2.1')
    expect(ipBucket('::ffff:c000:201')).toBe('192.0.2.1')
  })

  it('bir /64 dagi manzillar — bitta chelak, boshqa /64 — boshqa', () => {
    const a = ipBucket('2001:db8:1:2:aaaa:bbbb:cccc:dddd')
    expect(a).toBe('2001:db8:1:2::/64')
    expect(ipBucket('2001:0db8:0001:0002::1')).toBe(a)
    expect(ipBucket('2001:db8:1:2::')).toBe(a)
    expect(ipBucket('2001:db8:1:3::1')).not.toBe(a)
    expect(ipBucket('::1')).toBe('0:0:0:0::/64')
    expect(ipBucket('2001:db8::1.2.3.4')).toBe('2001:db8:0:0::/64')
  })
})

describe('kunlik xesh', () => {
  it('IP o‘zi kalitda yo‘q, kalit 16 bayt hex; sana almashsa — boshqa kalit', () => {
    const today = dailyHashKey(SECRET, '2026-10-04')
    const key = limitKey(today, ['ip-day', '203.0.113.9'])
    expect(key).toMatch(/^[0-9a-f]{32}$/)
    expect(key).not.toContain('203')
    expect(limitKey(today, ['ip-day', '203.0.113.9'])).toBe(key)
    expect(limitKey(dailyHashKey(SECRET, '2026-10-05'), ['ip-day', '203.0.113.9'])).not.toBe(key)
    expect(
      limitKey(dailyHashKey('y'.repeat(40), '2026-10-04'), ['ip-day', '203.0.113.9']),
    ).not.toBe(key)
  })

  it('guard: IP yo‘q — null; kalitlarda xom IP/UA yo‘q', () => {
    expect(guardFor({})).toBeNull()
    const guard = guardFor({ 'x-real-ip': '203.0.113.9' })!
    const serialized = JSON.stringify(guard)
    expect(serialized).not.toContain('203.0.113.9')
    expect(serialized).not.toContain('Chrome')
    expect(new Set([guard.dedupe.key, ...guard.counters.map((c) => c.key)]).size).toBe(4)
  })

  it('guard: takror kaliti IP+UA+til+post bo‘yicha; hisoblagichlar UA’ga bog‘liq emas', () => {
    const base = guardFor({ 'x-real-ip': '203.0.113.9' })!
    const otherUa = guardFor({ 'x-real-ip': '203.0.113.9', 'user-agent': `${CHROME} Edg/140` })!
    const otherLang = guardFor({ 'x-real-ip': '203.0.113.9', 'accept-language': 'ru' })!
    const otherPost = guardFor({ 'x-real-ip': '203.0.113.9' }, 8)!
    const sameNet = guardFor({ 'x-real-ip': '2001:db8:1:2::1' })!
    const sameNet2 = guardFor({ 'x-real-ip': '2001:db8:1:2::ffff' })!
    expect(otherUa.dedupe.key).not.toBe(base.dedupe.key)
    expect(otherLang.dedupe.key).not.toBe(base.dedupe.key)
    expect(otherPost.dedupe.key).not.toBe(base.dedupe.key)
    expect(otherUa.counters.map((c) => c.key)).toEqual(base.counters.map((c) => c.key))
    // IP+post soatlik — post bo'yicha farq qiladi; IP soatlik/sutkalik — yo'q.
    expect(otherPost.counters[0]!.key).not.toBe(base.counters[0]!.key)
    expect(otherPost.counters.slice(1).map((c) => c.key)).toEqual(
      base.counters.slice(1).map((c) => c.key),
    )
    expect(sameNet2.dedupe.key).toBe(sameNet.dedupe.key)
  })

  it('guard: oynalar va muddatlar (soat, Toshkent sutkasi, 30 daqiqa), limitlar', () => {
    const guard = guardFor({ 'x-real-ip': '203.0.113.9' })!
    expect(guard.at.getTime()).toBe(NOW)
    expect(guard.dedupe.expiresAt.toISOString()).toBe('2026-10-04T05:45:00.000Z')
    const [postHour, hour, day] = guard.counters
    expect(postHour!.expiresAt.toISOString()).toBe('2026-10-04T06:00:00.000Z')
    expect(postHour!.max).toBe(30)
    expect(hour!.expiresAt.toISOString()).toBe('2026-10-04T06:00:00.000Z')
    expect(hour!.max).toBe(300)
    // Toshkent yarim tuni = 19:00 UTC.
    expect(day!.expiresAt.toISOString()).toBe('2026-10-04T19:00:00.000Z')
    expect(day!.max).toBe(1500)
    // Keyingi soat — yangi soatlik kalitlar, sutkalik o'sha.
    const later = guardFor({ 'x-real-ip': '203.0.113.9' }, 7, NOW + 60 * 60_000)!
    expect(later.counters[1]!.key).not.toBe(hour!.key)
    expect(later.counters[2]!.key).toBe(day!.key)
    // Toshkent yarim tunidan keyin — barcha kalitlar boshqa (kunlik kalit almashdi).
    const nextDay = guardFor({ 'x-real-ip': '203.0.113.9' }, 7, Date.parse('2026-10-04T19:00:01Z'))!
    expect(nextDay.counters[2]!.key).not.toBe(day!.key)
    expect(nextDay.dedupe.key).not.toBe(guard.dedupe.key)
    expect(nextDay.counters[2]!.expiresAt.toISOString()).toBe('2026-10-05T19:00:00.000Z')
  })
})

describe('handler + guard', () => {
  const deps = { rateLimit: { secret: SECRET, limits: LIMITS }, now: () => NOW }

  it('IP bo‘lsa — record guard bilan chaqiriladi; IP yo‘q — null', async () => {
    const record = vi.fn(async (_postId: number, _guard: ViewGuard | null) => 'counted' as const)
    await handleViewRequest(viewRequest({ 'x-real-ip': '203.0.113.9' }), { ...deps, record })
    expect(record.mock.calls[0]![1]?.counters).toHaveLength(3)
    await handleViewRequest(viewRequest(), { ...deps, record })
    expect(record.mock.calls[1]![1]).toBeNull()
    // rateLimit berilmasa — guard yo'q.
    await handleViewRequest(viewRequest({ 'x-real-ip': '203.0.113.9' }), { record })
    expect(record.mock.calls[2]![1]).toBeNull()
  })

  it('limited / duplicate — baribir 204; cookie: duplicate’da bor, limited’da yo‘q', async () => {
    const limited = await handleViewRequest(viewRequest({ 'x-real-ip': '203.0.113.9' }), {
      ...deps,
      record: async () => 'limited',
    })
    expect(limited.outcome).toBe('limited')
    expect(limited.response.status).toBe(204)
    expect(limited.response.headers.get('set-cookie')).toBeNull()
    const duplicate = await handleViewRequest(viewRequest({ 'x-real-ip': '203.0.113.9' }), {
      ...deps,
      record: async () => 'duplicate',
    })
    expect(duplicate.outcome).toBe('duplicate')
    expect(duplicate.response.status).toBe(204)
    expect(duplicate.response.headers.get('set-cookie')).toMatch(/^bo_pv=7-/)
  })

  it('tozalash: faqat guard bilan va tasodifan; xatosi javobni buzmaydi', async () => {
    const prune = vi.fn(async () => {
      throw new Error('db')
    })
    const onError = vi.fn()
    const run = (random: number, headers: Record<string, string>) =>
      handleViewRequest(viewRequest(headers), {
        ...deps,
        record: async () => 'counted',
        prune,
        random: () => random,
        onError,
      })
    await run(VIEW_LIMITS_PRUNE_PROBABILITY + 0.01, { 'x-real-ip': '203.0.113.9' })
    expect(prune).not.toHaveBeenCalled()
    await run(0, {})
    expect(prune).not.toHaveBeenCalled()
    const result = await run(0, { 'x-real-ip': '203.0.113.9' })
    expect(prune).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
    expect(result.outcome).toBe('counted')
    expect(result.response.status).toBe(204)
  })
})

describe('env: PAGEVIEW_RATE_*', () => {
  const base = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    PAYLOAD_SECRET: SECRET,
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'media',
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret',
  }

  it('standart 300 / 1500 / 30; bo‘sh yoki 0 — standart; musbat son qabul qilinadi', () => {
    for (const value of [undefined, '', '0']) {
      const env = parseEnv({
        ...base,
        PAGEVIEW_RATE_PER_HOUR: value,
        PAGEVIEW_RATE_PER_DAY: value,
        PAGEVIEW_RATE_PER_POST_HOUR: value,
      })
      expect([
        env.PAGEVIEW_RATE_PER_HOUR,
        env.PAGEVIEW_RATE_PER_DAY,
        env.PAGEVIEW_RATE_PER_POST_HOUR,
      ]).toEqual([300, 1500, 30])
    }
    expect(parseEnv({ ...base, PAGEVIEW_RATE_PER_HOUR: '1000' }).PAGEVIEW_RATE_PER_HOUR).toBe(1000)
    expect(() => parseEnv({ ...base, PAGEVIEW_RATE_PER_DAY: '-1' })).toThrow(
      /PAGEVIEW_RATE_PER_DAY/,
    )
  })
})
