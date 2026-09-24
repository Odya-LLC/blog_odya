import { describe, expect, it } from 'vitest'

import { extractApiKey } from '@/auth/api-key'
import { createRateLimiter } from '@/auth/rate-limit'
import { resolveAuditChannel, runWithAuditChannel } from '@/audit/channel'
import { computeDiff, MAX_VALUE_CHARS } from '@/audit/diff'
import { clientIp } from '@/audit/hooks'

/** Audit (diff, kanal) va API kalit yordamchilari — DB'siz unit testlar (M2-05). */

type Req = Parameters<typeof resolveAuditChannel>[0]
const req = (overrides: Partial<Req>): Req =>
  ({ context: {}, payloadAPI: 'local', user: null, ...overrides }) as Req
const jwtUser = { id: 1, collection: 'users', _strategy: 'local-jwt' } as unknown as Req['user']
const keyUser = { id: 1, collection: 'users', _strategy: 'api-key' } as unknown as Req['user']

describe('audit: diff', () => {
  it('faqat o‘zgargan yuqori darajadagi maydonlar', () => {
    const diff = computeDiff(
      { id: 1, title: 'A', excerpt: 'x', tags: [1, 2], updatedAt: '2026-01-01' },
      { id: 1, title: 'B', excerpt: 'x', tags: [1, 2], updatedAt: '2026-01-02' },
    )
    expect(diff).toEqual({ title: { from: 'A', to: 'B' } })
  })

  it('kalit tartibi va populyatsiya qilingan bog‘lanishlar soxta farq bermaydi', () => {
    const diff = computeDiff(
      { meta: { a: 1, b: 2 }, category: 5, coverImage: null },
      {
        meta: { b: 2, a: 1 },
        category: { id: 5, name: 'AI', createdAt: 'x', updatedAt: 'y' },
        coverImage: null,
      },
    )
    expect(diff).toEqual({})
  })

  it('array/blok qatorlari (id bor, timestamp yo‘q) ichma-ich taqqoslanadi', () => {
    const diff = computeDiff(
      { faq: [{ id: 'r1', question: 'Q', answer: 'A' }] },
      { faq: [{ id: 'r1', question: 'Q', answer: 'B' }] },
    )
    expect(Object.keys(diff)).toEqual(['faq'])
  })

  it('katta qiymatlar qisqartiriladi', () => {
    const big = 'x'.repeat(MAX_VALUE_CHARS + 10)
    const diff = computeDiff({ content: 'a' }, { content: big })
    expect(diff.content).toEqual({ from: 'a', to: { _omitted: true, chars: big.length + 2 } })
  })

  it('maxfiy maydonlar hech qachon yozilmaydi', () => {
    const diff = computeDiff(
      { name: 'A', hash: 'h1', salt: 's1', apiKey: null, apiKeyIndex: null, enableAPIKey: false },
      { name: 'A', hash: 'h2', salt: 's2', apiKey: 'k', apiKeyIndex: 'i', enableAPIKey: true },
    )
    expect(diff).toEqual({ enableAPIKey: { from: false, to: true } })
  })

  it('yaratishda — faqat bo‘sh bo‘lmagan maydonlar', () => {
    const diff = computeDiff(null, { id: 3, title: 'T', excerpt: '', tags: [], category: 2 })
    expect(diff).toEqual({ title: { from: null, to: 'T' }, category: { from: null, to: 2 } })
  })
})

describe('audit: kanal', () => {
  it('req.context.channel ustun', () => {
    expect(resolveAuditChannel(req({ context: { channel: 'mcp' }, user: keyUser }))).toBe('mcp')
  })

  it('GraphQL, API kalit, JWT va foydalanuvchisiz', () => {
    expect(resolveAuditChannel(req({ payloadAPI: 'GraphQL', user: keyUser }))).toBe('graphql')
    expect(resolveAuditChannel(req({ payloadAPI: 'REST', user: keyUser }))).toBe('rest')
    expect(resolveAuditChannel(req({ payloadAPI: 'REST', user: jwtUser }))).toBe('admin')
    expect(resolveAuditChannel(req({ payloadAPI: 'local', user: jwtUser }))).toBe('admin')
    expect(resolveAuditChannel(req({ payloadAPI: 'local' }))).toBe('job')
  })

  it('noto‘g‘ri context qiymati e’tiborsiz', () => {
    expect(resolveAuditChannel(req({ context: { channel: 'hack' }, user: jwtUser }))).toBe('admin')
  })

  it('runWithAuditChannel — muhit kanali (job)', async () => {
    const channel = await runWithAuditChannel('job', async () => {
      await Promise.resolve()
      return resolveAuditChannel(req({ user: jwtUser }))
    })
    expect(channel).toBe('job')
    expect(resolveAuditChannel(req({ user: jwtUser }))).toBe('admin')
  })

  it('IP — x-forwarded-for birinchi qiymati', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4')
    expect(clientIp(new Headers({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8')
    expect(clientIp(new Headers())).toBeNull()
  })
})

describe('API kalit: sarlavha va rate limit', () => {
  it('`users API-Key` va (faqat MCP uchun) `Bearer`', () => {
    expect(extractApiKey('users API-Key abc')).toEqual({ scheme: 'api-key', key: 'abc' })
    expect(extractApiKey('Bearer abc')).toBeNull()
    expect(extractApiKey('Bearer abc', { bearer: true })).toEqual({ scheme: 'bearer', key: 'abc' })
    expect(extractApiKey('JWT abc', { bearer: true })).toBeNull()
    expect(extractApiKey('users API-Key ')).toBeNull()
    expect(extractApiKey(null)).toBeNull()
  })

  it('60/daqiqa: oshsa rad etiladi, oyna tugagach tiklanadi', () => {
    let now = 1_000_000
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now })
    expect([1, 2, 3].map(() => limiter.hit('k').allowed)).toEqual([true, true, true])
    const blocked = limiter.hit('k')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSec).toBe(60)
    // Boshqa kalit — alohida hisob.
    expect(limiter.hit('other').allowed).toBe(true)
    now += 45_000
    expect(limiter.hit('k').retryAfterSec).toBe(15)
    now += 15_000
    expect(limiter.hit('k')).toMatchObject({ allowed: true, remaining: 2 })
  })
})
