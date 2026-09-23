import type { CollectionSlug, GlobalSlug, Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Category, User } from '@/payload-types'

import {
  as,
  createTestCategory,
  createTestUsers,
  deleteTestContent,
  testSlug,
  type TestUsers,
} from './helpers/content'
import { deleteTestUsers, initTestPayload, testEmail } from './helpers/payload'

/**
 * Rol × amal matritsasi (TZ §4.2) — Local API (`overrideAccess: false`) + Docker Postgres.
 * admin — hammasi; editor — kontent va menyularni boshqaradi, publish qiladi, lekin o'chira olmaydi,
 * foydalanuvchilar va tizim sozlamalarini boshqara olmaydi; anonim — faqat ommaviy o'qish.
 *
 * `sources` kolleksiyasi (editor boshqara olmaydi) — M2-01 da, uning testi o'sha yerda.
 */
let payload: Payload
let users: TestUsers
let category: Category

type Actor = 'anon' | 'editor' | 'admin'
type Action = 'create' | 'read' | 'update' | 'delete'

const actorUser = (actor: Actor): User | null =>
  actor === 'anon' ? null : actor === 'editor' ? users.editor : users.admin

/** Har bir kolleksiya uchun test hujjati ma'lumotlari. */
const docData: Partial<Record<CollectionSlug, () => Record<string, unknown>>> = {
  categories: () => ({ name: 'Test', slug: testSlug('cat') }),
  tags: () => ({ name: 'Test', slug: testSlug('tag') }),
  authors: () => ({ name: 'Test muallif', slug: testSlug('author') }),
  pages: () => ({ title: 'Test sahifa', slug: testSlug('page'), _status: 'published' }),
  posts: () => ({ title: 'Test post', slug: testSlug('post'), category: category.id }),
  redirects: () => ({
    from: `/${testSlug('from')}`,
    to: { type: 'custom', url: '/boshqa' },
    type: '301',
  }),
}

/** Kutilgan natija: true — ruxsat, false — 403 (yoki o'qishda ko'rinmaydi). */
const MATRIX: Record<string, Record<Action, Record<Actor, boolean>>> = {
  categories: {
    create: { anon: false, editor: true, admin: true },
    read: { anon: true, editor: true, admin: true },
    update: { anon: false, editor: true, admin: true },
    delete: { anon: false, editor: false, admin: true },
  },
  tags: {
    create: { anon: false, editor: true, admin: true },
    read: { anon: true, editor: true, admin: true },
    update: { anon: false, editor: true, admin: true },
    delete: { anon: false, editor: false, admin: true },
  },
  authors: {
    create: { anon: false, editor: true, admin: true },
    read: { anon: true, editor: true, admin: true },
    update: { anon: false, editor: true, admin: true },
    delete: { anon: false, editor: false, admin: true },
  },
  pages: {
    create: { anon: false, editor: true, admin: true },
    read: { anon: true, editor: true, admin: true },
    update: { anon: false, editor: true, admin: true },
    delete: { anon: false, editor: false, admin: true },
  },
  posts: {
    create: { anon: false, editor: true, admin: true },
    // Qoralama post: anonim ko'rmaydi (chop etilgani — posts-workflow testida).
    read: { anon: false, editor: true, admin: true },
    update: { anon: false, editor: true, admin: true },
    delete: { anon: false, editor: false, admin: true },
  },
  redirects: {
    create: { anon: false, editor: true, admin: true },
    read: { anon: true, editor: true, admin: true },
    update: { anon: false, editor: true, admin: true },
    delete: { anon: false, editor: false, admin: true },
  },
}

const cases = Object.entries(MATRIX).flatMap(([collection, actions]) =>
  (Object.entries(actions) as [Action, Record<Actor, boolean>][]).flatMap(([action, actors]) =>
    (Object.entries(actors) as [Actor, boolean][]).map(
      ([actor, allowed]) => [collection as CollectionSlug, action, actor, allowed] as const,
    ),
  ),
)

async function seedDoc(collection: CollectionSlug) {
  const data = docData[collection]
  if (!data) throw new Error(`docData yo‘q: ${collection}`)
  return payload.create({ collection, data: data() as never })
}

async function attempt(collection: CollectionSlug, action: Action, actor: Actor): Promise<boolean> {
  const access = as(actorUser(actor))
  try {
    switch (action) {
      case 'create': {
        await payload.create({ collection, data: docData[collection]!() as never, ...access })
        return true
      }
      case 'read': {
        const doc = await seedDoc(collection)
        const result = await payload.find({
          collection,
          where: { id: { equals: doc.id } },
          ...access,
        })
        return result.docs.length === 1
      }
      case 'update': {
        const doc = await seedDoc(collection)
        const field = collection === 'redirects' ? { type: '302' } : {}
        await payload.update({ collection, id: doc.id, data: field as never, ...access })
        return true
      }
      case 'delete': {
        const doc = await seedDoc(collection)
        await payload.delete({ collection, id: doc.id, ...access })
        return true
      }
    }
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 403 || status === 401) return false
    throw error
  }
}

beforeAll(async () => {
  payload = await initTestPayload()
  await deleteTestContent(payload)
  await deleteTestUsers(payload)
  users = await createTestUsers(payload)
  category = await createTestCategory(payload)
  // Toza DB'da (CI) majburiy `siteName` bo'sh — bo'sh saqlash validatsiyadan o'tishi uchun.
  const settings = await payload.findGlobal({ slug: 'site-settings' })
  if (!settings.siteName) {
    await payload.updateGlobal({ slug: 'site-settings', data: { siteName: 'Blog Odya' } })
  }
})

afterAll(async () => {
  if (payload) {
    await deleteTestContent(payload)
    await deleteTestUsers(payload)
  }
  await payload?.db?.destroy?.()
})

describe('rol × amal matritsasi (TZ §4.2): kolleksiyalar', () => {
  it.each(cases)('%s.%s — %s: ruxsat=%s', async (collection, action, actor, allowed) => {
    expect(await attempt(collection, action, actor)).toBe(allowed)
  })

  it('editor foydalanuvchilarni boshqara olmaydi (yaratish, o‘chirish, rol)', async () => {
    const editor = as(users.editor)
    await expect(
      payload.create({
        collection: 'users',
        data: { email: testEmail('x'), password: 'Parol-123456', name: 'X', role: 'editor' },
        ...editor,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      payload.delete({ collection: 'users', id: users.editor2.id, ...editor }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('editor o‘ziga muallif profilini biriktira olmaydi (faqat admin)', async () => {
    const author = await seedDoc('authors')
    await payload.update({
      collection: 'users',
      id: users.editor.id,
      data: { author: author.id as number },
      ...as(users.editor),
    })
    expect(
      (await payload.findByID({ collection: 'users', id: users.editor.id })).author ?? null,
    ).toBe(null)

    await payload.update({
      collection: 'users',
      id: users.editor.id,
      data: { author: author.id as number },
      ...as(users.admin),
    })
    const linked = await payload.findByID({ collection: 'users', id: users.editor.id, depth: 0 })
    expect(linked.author).toBe(author.id)
    await payload.update({ collection: 'users', id: users.editor.id, data: { author: null } })
  })

  it('editor postning tizim maydonlarini (telegram, views) yoza olmaydi', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: {
        ...docData.posts!(),
        views: 100,
        telegram: [{ script: 'uz-Latn', messageId: '1' }],
      } as never,
      ...as(users.editor),
    })
    expect(post.views ?? 0).toBe(0)
    expect(post.telegram ?? []).toHaveLength(0)
  })
})

/** Globals: [slug, o'qish (anon, editor, admin), yangilash (anon, editor, admin)]. */
const GLOBALS: [GlobalSlug, Record<Actor, boolean>, Record<Actor, boolean>][] = [
  [
    'site-settings',
    { anon: true, editor: true, admin: true },
    { anon: false, editor: false, admin: true },
  ],
  ['header', { anon: true, editor: true, admin: true }, { anon: false, editor: true, admin: true }],
  ['footer', { anon: true, editor: true, admin: true }, { anon: false, editor: true, admin: true }],
  [
    'telegram-settings',
    { anon: false, editor: true, admin: true },
    { anon: false, editor: false, admin: true },
  ],
  [
    'scraping-settings',
    { anon: false, editor: true, admin: true },
    { anon: false, editor: false, admin: true },
  ],
]

const globalCases = GLOBALS.flatMap(([slug, read, update]) =>
  (['anon', 'editor', 'admin'] as Actor[]).flatMap((actor) => [
    [slug, 'read', actor, read[actor]] as const,
    [slug, 'update', actor, update[actor]] as const,
  ]),
)

describe('rol × amal matritsasi (TZ §4.2): globals', () => {
  it.each(globalCases)('%s.%s — %s: ruxsat=%s', async (slug, action, actor, allowed) => {
    const access = as(actorUser(actor))
    const run = async () => {
      if (action === 'read') {
        await payload.findGlobal({ slug, ...access })
        return true
      }
      // Hozirgi qiymatni o'zgartirmasdan saqlash (bo'sh data).
      await payload.updateGlobal({ slug, data: {}, ...access })
      return true
    }
    const result = await run().catch((error: { status?: number }) => {
      if (error.status === 403 || error.status === 401) return false
      throw error
    })
    expect(result).toBe(allowed)
  })
})
