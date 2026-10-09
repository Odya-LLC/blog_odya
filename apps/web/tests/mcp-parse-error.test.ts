import type { Payload } from 'payload'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createRateLimiter } from '@/auth/rate-limit'
import { createMcpRoute, MCP_PATH } from '@/mcp/route'

/**
 * OBLOG-114 (Sentry BLOG_ODYA-J): mijoz yuborgan buzuq JSON (`{"postId":}}}`). `mcp-handler`
 * `req.json()` ni try'siz chaqiradi: `SyntaxError` kutilmagan rad etish (unhandled rejection)
 * bo'lib Sentry'ga tushardi, javob esa umuman qaytmasdi (so'rov `maxDuration` gacha osilib qolardi).
 * Endi — JSON-RPC `-32700` va HTTP 400. DB'siz: Payload o'rnida `admin` kalitini qaytaruvchi
 * soxta `find`.
 */
const ENDPOINT = `https://blog.odya.test${MCP_PATH}`

const fakePayload = {
  secret: 'test-secret',
  find: async () => ({ docs: [{ id: 1, email: 'admin@blog.odya.test', role: 'admin' }] }),
} as unknown as Payload

const route = createMcpRoute({
  getPayload: async () => fakePayload,
  siteUrl: 'https://blog.odya.test',
  limiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
  failureLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
})

const SENTRY_BODY =
  '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_post","arguments":{"postId":}}}'

/** Javob 3 s ichida qaytmasa — xato (tuzatishdan oldin handler hech qachon javob bermasdi). */
async function post(body: string, headers: Record<string, string> = {}): Promise<Response> {
  const request = new Request(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: 'Bearer test-mcp-key',
      ...headers,
    },
    body,
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('MCP javob qaytarmadi (osilib qoldi)')), 3_000)
  })
  try {
    return await Promise.race([route.POST(request), timeout])
  } finally {
    clearTimeout(timer)
  }
}

const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason)
}

beforeEach(() => {
  unhandled.length = 0
  process.on('unhandledRejection', onUnhandled)
})
afterEach(() => {
  process.off('unhandledRejection', onUnhandled)
})

/** Kechikkan rad etishlar ham ushlanishi uchun — bir necha tick kutamiz. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe('POST /api/mcp: buzuq JSON (OBLOG-114)', () => {
  it.each([
    ['Sentry fragmenti', SENTRY_BODY],
    ['kesilgan tana', '{"jsonrpc":"2.0","id":1,"method":"tools/ca'],
    ["bo'sh tana", ''],
  ])('%s → 400 va JSON-RPC -32700, istisnosiz', async (_name, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error: Invalid JSON' },
      id: null,
    })
    await settle()
    expect(unhandled).toEqual([])
  })

  it('kalitsiz so‘rov — avval 401 (tana tahlil qilinmaydi)', async () => {
    const res = await post(SENTRY_BODY, { Authorization: '' })
    expect(res.status).toBe(401)
    await settle()
    expect(unhandled).toEqual([])
  })

  it('to‘g‘ri JSON — odatdagidek SDK transportiga uzatiladi', async () => {
    const res = await post(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'vitest', version: '1.0.0' },
        },
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('"serverInfo"')
  })

  it('JSON, lekin JSON-RPC emas — SDK o‘zi 400/-32700 qaytaradi', async () => {
    const res = await post('{"foo":1}')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ jsonrpc: '2.0', error: { code: -32700 } })
  })
})
