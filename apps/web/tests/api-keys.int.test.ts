import { GRAPHQL_POST, REST_DELETE, REST_GET, REST_PATCH, REST_POST } from '@payloadcms/next/routes'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { authenticateBearer } from '@/auth/api-key'
import { apiKeyRateLimiter, createRateLimiter } from '@/auth/rate-limit'
import { createApiKeyGuard } from '@/auth/route-guard'
import type { AuditLog, Category, User } from '@/payload-types'
import config from '@/payload.config'

import {
  as,
  createTestCategory,
  createTestUsers,
  deleteTestContent,
  testSlug,
  type TestUsers,
} from './helpers/content'
import { deleteTestUsers, initTestPayload } from './helpers/payload'

/**
 * API kalitlar (M2-05, TZ §6.2): Payload REST/GraphQL route handler'lari (`app/(payload)/api`)
 * haqiqiy `Request` bilan — guard (401/429) + Payload'ning `users API-Key` strategiyasi.
 */
let payload: Payload
let users: TestUsers
let category: Category

const guard = createApiKeyGuard({ getPayload: async () => payload })
const handlers = {
  GET: guard(REST_GET(config)),
  POST: guard(REST_POST(config)),
  PATCH: guard(REST_PATCH(config)),
  DELETE: guard(REST_DELETE(config)),
  GRAPHQL: guard(GRAPHQL_POST(config)),
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

async function rest(
  method: Method,
  path: string,
  {
    key,
    body,
    headers = {},
  }: { key?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const url = new URL(`http://localhost:3000/api${path}`)
  const request = new Request(url, {
    method,
    headers: {
      ...(key ? { Authorization: `users API-Key ${key}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const slug = url.pathname.replace(/^\/api\//, '').split('/')
  const response = await handlers[method](request, { params: Promise.resolve({ slug }) })
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null
  return { status: response.status, headers: response.headers, json }
}

async function enableKey(user: User, actor: User = user): Promise<string> {
  const key = crypto.randomUUID()
  await payload.update({
    collection: 'users',
    id: user.id,
    data: { apiKey: key, enableAPIKey: true },
    ...as(actor),
  })
  return key
}

describe('API kalitlar: REST va MCP (Bearer)', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await deleteTestContent(payload)
    await deleteTestUsers(payload)
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
  })

  beforeEach(() => apiKeyRateLimiter.reset())

  afterAll(async () => {
    if (payload) {
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
    }
    await payload?.db?.destroy?.()
  })

  it('kalit bilan REST so‘rov ishlaydi (foydalanuvchi — kalit egasi)', async () => {
    const key = await enableKey(users.editor)
    const me = await rest('GET', '/users/me', { key })
    expect(me.status).toBe(200)
    expect((me.json?.user as User | null)?.id).toBe(users.editor.id)

    // Editor huquqlari: qoralamalarni ko'radi, foydalanuvchilar ro'yxatida faqat o'zi.
    const list = await rest('GET', '/users?limit=100', { key })
    expect(list.status).toBe(200)
    expect((list.json?.docs as User[]).map((doc) => doc.id)).toEqual([users.editor.id])
  })

  it('kalit va uning xeshi hech qachon qaytarilmaydi', async () => {
    const key = await enableKey(users.editor)
    const adminKey = await enableKey(users.admin)
    const res = await rest('GET', `/users/${users.editor.id}`, { key: adminKey })
    expect(res.status).toBe(200)
    expect(res.json).not.toHaveProperty('apiKey')
    expect(res.json).not.toHaveProperty('apiKeyIndex')
    expect(res.json).not.toHaveProperty('hash')
    expect(JSON.stringify(res.json)).not.toContain(key)
  })

  it('bekor qilingan kalit — 401 (admin "Revoke": apiKey null)', async () => {
    const key = await enableKey(users.editor)
    expect((await rest('GET', '/users/me', { key })).status).toBe(200)

    await payload.update({
      collection: 'users',
      id: users.editor.id,
      data: { apiKey: null, enableAPIKey: false },
      ...as(users.editor),
    })
    const res = await rest('GET', '/users/me', { key })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe('users API-Key')
  })

  it('`enableAPIKey: false` kalit bilan birga yuborilsa ham kalit bekor bo‘ladi', async () => {
    const key = await enableKey(users.editor)
    await payload.update({
      collection: 'users',
      id: users.editor.id,
      data: { enableAPIKey: false, apiKey: key },
      ...as(users.editor),
    })
    expect((await rest('GET', '/users/me', { key })).status).toBe(401)
    const fresh = await payload.findByID({ collection: 'users', id: users.editor.id })
    expect(fresh.enableAPIKey).toBe(false)
  })

  it('yangi kalit eskisini almashtiradi; noto‘g‘ri kalit — 401', async () => {
    const oldKey = await enableKey(users.editor)
    const newKey = await enableKey(users.editor)
    expect((await rest('GET', '/users/me', { key: oldKey })).status).toBe(401)
    expect((await rest('GET', '/users/me', { key: newKey })).status).toBe(200)
    expect((await rest('GET', '/users/me', { key: crypto.randomUUID() })).status).toBe(401)
  })

  it('editor boshqa foydalanuvchiga kalit yarata olmaydi, admin — hammaga', async () => {
    await expect(enableKey(users.editor2, users.editor)).rejects.toMatchObject({ status: 403 })
    const key = await enableKey(users.editor2, users.admin)
    const me = await rest('GET', '/users/me', { key })
    expect((me.json?.user as User | null)?.id).toBe(users.editor2.id)
  })

  it('kalitsiz so‘rovlar o‘zgarishsiz o‘tadi (anonim)', async () => {
    const res = await rest('GET', '/users/me')
    expect(res.status).toBe(200)
    expect(res.json?.user).toBeNull()
  })

  it('rate limit: kalit bo‘yicha, oshsa 429 + Retry-After', async () => {
    const key = await enableKey(users.editor)
    const limited = createApiKeyGuard({
      getPayload: async () => payload,
      limiter: createRateLimiter({ limit: 2 }),
    })(REST_GET(config))
    const call = () =>
      limited(
        new Request('http://localhost:3000/api/users/me', {
          headers: { Authorization: `users API-Key ${key}` },
        }),
        { params: Promise.resolve({ slug: ['users', 'me'] }) },
      )
    expect((await call()).status).toBe(200)
    expect((await call()).status).toBe(200)
    const blocked = await call()
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('REST orqali post o‘zgarishi audit log’da `channel: rest`', async () => {
    const key = await enableKey(users.editor)
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'REST post',
        slug: testSlug('rest'),
        category: category.id,
        workflowStatus: 'draft',
      },
      ...as(users.editor),
    })
    const res = await rest('PATCH', `/posts/${post.id}`, {
      key,
      body: { title: 'REST orqali' },
      headers: { 'User-Agent': 'vitest-agent/1.0', 'X-Forwarded-For': '203.0.113.7, 10.0.0.1' },
    })
    expect(res.status).toBe(200)

    const { docs } = await payload.find({
      collection: 'audit-logs',
      where: { collection: { equals: 'posts' }, docId: { equals: String(post.id) } },
      sort: '-createdAt',
      limit: 1,
    })
    const log = docs[0] as AuditLog
    expect(log).toMatchObject({
      action: 'update',
      channel: 'rest',
      actorType: 'user',
      ip: '203.0.113.7',
      userAgent: 'vitest-agent/1.0',
      locale: 'uz-Latn',
      diff: { title: { from: 'REST post', to: 'REST orqali' } },
    })
    expect(typeof log.user === 'object' ? log.user?.id : log.user).toBe(users.editor.id)
  })

  it('admin autosave (`?autosave=true`) audit’ga yozilmaydi, qo‘lda saqlash — yoziladi', async () => {
    const key = await enableKey(users.editor)
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'Autosave post',
        slug: testSlug('autosave'),
        category: category.id,
        workflowStatus: 'draft',
      },
      ...as(users.editor),
    })
    const count = async () =>
      (
        await payload.count({
          collection: 'audit-logs',
          where: { docId: { equals: String(post.id) }, collection: { equals: 'posts' } },
        })
      ).totalDocs
    const before = await count()
    const autosave = await rest('PATCH', `/posts/${post.id}?autosave=true&draft=true`, {
      key,
      body: { title: 'Autosave 1' },
    })
    expect(autosave.status).toBe(200)
    expect(await count()).toBe(before)

    const manual = await rest('PATCH', `/posts/${post.id}?draft=true`, {
      key,
      body: { title: 'Qo‘lda saqlandi' },
    })
    expect(manual.status).toBe(200)
    expect(await count()).toBe(before + 1)
  })

  it('GraphQL orqali o‘zgarish — `channel: graphql`', async () => {
    const key = await enableKey(users.editor)
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'GQL post',
        slug: testSlug('gql'),
        category: category.id,
        workflowStatus: 'draft',
      },
      ...as(users.editor),
    })
    const response = await handlers.GRAPHQL(
      new Request('http://localhost:3000/api/graphql', {
        method: 'POST',
        headers: { Authorization: `users API-Key ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation { updatePost(id: ${post.id}, data: { title: "GQL orqali" }) { id title } }`,
        }),
      }),
    )
    const body = (await response.json()) as { errors?: unknown }
    expect(body.errors).toBeUndefined()
    const { docs } = await payload.find({
      collection: 'audit-logs',
      where: { docId: { equals: String(post.id) }, action: { equals: 'update' } },
      limit: 1,
    })
    expect(docs[0]).toMatchObject({ channel: 'graphql', collection: 'posts' })
  })

  it('audit yozuvini REST orqali yaratish/o‘zgartirish/o‘chirish rad etiladi', async () => {
    const adminKey = await enableKey(users.admin)
    const { docs } = await payload.find({ collection: 'audit-logs', limit: 1 })
    const log = docs[0] as AuditLog
    expect(log).toBeDefined()

    const created = await rest('POST', '/audit-logs', {
      key: adminKey,
      body: { action: 'create', actorType: 'user', channel: 'rest' },
    })
    expect(created.status).toBe(403)
    const patched = await rest('PATCH', `/audit-logs/${log.id}`, {
      key: adminKey,
      body: { channel: 'job' },
    })
    expect(patched.status).toBe(403)
    const deleted = await rest('DELETE', `/audit-logs/${log.id}`, { key: adminKey })
    expect(deleted.status).toBe(403)

    const fresh = await payload.findByID({ collection: 'audit-logs', id: log.id })
    expect(fresh.channel).toBe(log.channel)
  })

  it('MCP Bearer helper: kalit → foydalanuvchi, bekor qilingan — 401', async () => {
    const key = await enableKey(users.editor)
    const ok = await authenticateBearer(payload, new Headers({ Authorization: `Bearer ${key}` }))
    expect(ok.ok && ok.user.id).toBe(users.editor.id)
    expect(ok.ok && ok.user._strategy).toBe('api-key')

    const missing = await authenticateBearer(payload, new Headers())
    expect(missing).toMatchObject({ ok: false, status: 401 })

    await payload.update({
      collection: 'users',
      id: users.editor.id,
      data: { apiKey: null },
      ...as(users.editor),
    })
    const revoked = await authenticateBearer(
      payload,
      new Headers({ Authorization: `Bearer ${key}` }),
    )
    expect(revoked).toMatchObject({ ok: false, status: 401 })
  })

  it('MCP Bearer helper: rate limit — 429', async () => {
    const key = await enableKey(users.editor)
    const limiter = createRateLimiter({ limit: 1 })
    const headers = new Headers({ Authorization: `Bearer ${key}` })
    expect((await authenticateBearer(payload, headers, { limiter })).ok).toBe(true)
    expect(await authenticateBearer(payload, headers, { limiter })).toMatchObject({
      ok: false,
      status: 429,
    })
  })
})
