import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runWithAuditChannel } from '@/audit/channel'
import type { AuditLog, Category, Post } from '@/payload-types'

import {
  as,
  createTestCategory,
  createTestUsers,
  deleteTestContent,
  TEST_PASSWORD,
  testSlug,
  type TestUsers,
} from './helpers/content'
import { deleteTestUsers, initTestPayload } from './helpers/payload'

/**
 * Audit log (M2-05, TZ §6.4, §10.12): hook'lar, kanal, diff va o'zgarmaslik — Local API +
 * Docker Postgres. REST/GraphQL kanallari — `api-keys.int.test.ts`.
 */
let payload: Payload
let users: TestUsers
let category: Category

async function newPost(overrides: Partial<Post> = {}): Promise<Post> {
  return payload.create({
    collection: 'posts',
    data: {
      title: 'Audit post',
      slug: testSlug('audit'),
      category: category.id,
      workflowStatus: 'draft',
      ...overrides,
    },
    ...as(users.editor),
  })
}

async function logsFor(collection: string, docId: number | string): Promise<AuditLog[]> {
  const { docs } = await payload.find({
    collection: 'audit-logs',
    where: { collection: { equals: collection }, docId: { equals: String(docId) } },
    sort: 'createdAt',
    pagination: false,
  })
  return docs
}

const userId = (log: AuditLog) => (typeof log.user === 'object' ? log.user?.id : log.user)

describe('audit log', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await deleteTestContent(payload)
    await deleteTestUsers(payload)
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
  })

  afterAll(async () => {
    if (payload) {
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
    }
    await payload?.db?.destroy?.()
  })

  it('post yaratish va o‘zgartirish (admin sessiyasi) — `channel: admin`, diff', async () => {
    const post = await newPost()
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { title: 'Yangi sarlavha', excerpt: 'Lid' },
      ...as(users.editor),
    })

    const [created, updated] = await logsFor('posts', post.id)
    expect(created).toMatchObject({
      action: 'create',
      channel: 'admin',
      actorType: 'user',
      title: 'Audit post',
      locale: 'uz-Latn',
    })
    expect(created?.diff).toMatchObject({ title: { from: null, to: 'Audit post' } })
    expect(updated).toMatchObject({
      action: 'update',
      channel: 'admin',
      diff: {
        title: { from: 'Audit post', to: 'Yangi sarlavha' },
        excerpt: { from: null, to: 'Lid' },
      },
    })
    expect(userId(updated as AuditLog)).toBe(users.editor.id)
  })

  it('MCP: `req.context.channel` va tool nomi', async () => {
    const post = await newPost()
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { excerpt: 'Agent yozdi' },
      context: { channel: 'mcp', mcpTool: 'save_rewrite' },
      ...as(users.editor),
    })
    const logs = await logsFor('posts', post.id)
    expect(logs.at(-1)).toMatchObject({ channel: 'mcp', tool: 'save_rewrite', action: 'update' })
  })

  it('foydalanuvchisiz (seed/job) — `channel: job`, `actorType: system`', async () => {
    const post = await newPost()
    await payload.update({ collection: 'posts', id: post.id, data: { excerpt: 'Tizim' } })
    const logs = await logsFor('posts', post.id)
    expect(logs.at(-1)).toMatchObject({ channel: 'job', actorType: 'system', user: null })
  })

  it('`/api/jobs/run` muhiti — foydalanuvchi nomidan bo‘lsa ham `channel: job`', async () => {
    const post = await newPost()
    await runWithAuditChannel('job', () =>
      payload.update({
        collection: 'posts',
        id: post.id,
        data: { excerpt: 'Rejalashtirilgan' },
        ...as(users.editor),
      }),
    )
    const logs = await logsFor('posts', post.id)
    expect(logs.at(-1)).toMatchObject({ channel: 'job', actorType: 'user' })
  })

  it('o‘zgarishsiz saqlash audit’ga yozilmaydi', async () => {
    const post = await newPost()
    const save = () =>
      payload.update({
        collection: 'posts',
        id: post.id,
        data: { title: post.title },
        ...as(users.editor),
      })
    // Birinchi saqlash hosila maydonlarni (`readingTime`) to'ldiradi — bu haqiqiy o'zgarish.
    await save()
    const before = (await logsFor('posts', post.id)).length
    await save()
    expect(await logsFor('posts', post.id)).toHaveLength(before)
  })

  it('publish — `action: publish`; o‘chirish — `action: delete`', async () => {
    const post = await newPost()
    for (const workflowStatus of ['in_progress', 'review'] as const) {
      await payload.update({
        collection: 'posts',
        id: post.id,
        data: { workflowStatus },
        ...as(users.editor),
      })
    }
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { _status: 'published' },
      ...as(users.editor),
    })
    await payload.delete({ collection: 'posts', id: post.id, ...as(users.admin) })

    const actions = (await logsFor('posts', post.id)).map((log) => log.action)
    expect(actions).toContain('publish')
    expect(actions.at(-1)).toBe('delete')
    const deleted = (await logsFor('posts', post.id)).at(-1) as AuditLog
    expect(userId(deleted)).toBe(users.admin.id)
    expect(deleted.title).toBe('Audit post')
  })

  it('boshqa kolleksiyalar va globallar ham audit qilinadi', async () => {
    const tag = await payload.create({
      collection: 'tags',
      data: { name: 'Audit teg', slug: testSlug('tag') },
      ...as(users.editor),
    })
    expect(await logsFor('tags', tag.id)).toHaveLength(1)

    const settings = await payload.findGlobal({ slug: 'scraping-settings' })
    await payload.updateGlobal({
      slug: 'scraping-settings',
      data: { minScore: settings.minScore === 50 ? 51 : 50 },
      ...as(users.admin),
    })
    const { docs } = await payload.find({
      collection: 'audit-logs',
      where: { global: { equals: 'scraping-settings' } },
      sort: '-createdAt',
      limit: 1,
    })
    expect(docs[0]).toMatchObject({ action: 'update', channel: 'admin' })
    expect(Object.keys(docs[0]?.diff as object)).toEqual(['minScore'])
    // Qaytarib qo'yish.
    await payload.updateGlobal({ slug: 'scraping-settings', data: { minScore: settings.minScore } })
  })

  it('foydalanuvchi o‘zgarishida parol/kalit diff’ga tushmaydi', async () => {
    await payload.update({
      collection: 'users',
      id: users.editor2.id,
      data: { password: 'Yangi-parol-987654', apiKey: crypto.randomUUID(), name: 'Editor 3' },
      ...as(users.admin),
    })
    const logs = await logsFor('users', users.editor2.id)
    const last = logs.at(-1) as AuditLog
    expect(Object.keys(last.diff as object).sort()).toEqual(['enableAPIKey', 'name'])
  })

  it('audit yozuvini o‘zgartirish/o‘chirish rad etiladi (overrideAccess bilan ham)', async () => {
    const post = await newPost()
    const log = (await logsFor('posts', post.id))[0] as AuditLog

    await expect(
      payload.update({
        collection: 'audit-logs',
        id: log.id,
        data: { channel: 'job' },
        ...as(users.admin),
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.update({ collection: 'audit-logs', id: log.id, data: { channel: 'job' } }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.delete({ collection: 'audit-logs', id: log.id, ...as(users.admin) }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(payload.delete({ collection: 'audit-logs', id: log.id })).rejects.toMatchObject({
      status: 403,
    })
    await expect(
      payload.create({
        collection: 'audit-logs',
        data: { action: 'create', actorType: 'user', channel: 'admin' },
        ...as(users.admin),
      }),
    ).rejects.toMatchObject({ status: 403 })

    const fresh = await payload.findByID({ collection: 'audit-logs', id: log.id })
    expect(fresh.channel).toBe(log.channel)
  })

  it('login `lastLoginAt` ni yozadi, audit’da shovqin qilmaydi', async () => {
    const before = (await logsFor('users', users.admin.id)).length
    await payload.login({
      collection: 'users',
      data: { email: users.admin.email, password: TEST_PASSWORD },
    })
    const fresh = await payload.findByID({ collection: 'users', id: users.admin.id })
    expect(fresh.lastLoginAt).toBeTruthy()
    expect(await logsFor('users', users.admin.id)).toHaveLength(before)
  })

  it('o‘qish: admin va editor — ha, anonim — yo‘q', async () => {
    const editorView = await payload.find({
      collection: 'audit-logs',
      limit: 1,
      ...as(users.editor),
    })
    expect(editorView.totalDocs).toBeGreaterThan(0)
    await expect(payload.find({ collection: 'audit-logs', ...as(null) })).rejects.toMatchObject({
      status: 403,
    })
  })
})
