import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_AUTHOR_SLUG } from '@/collections/Posts/defaultAuthor'
import { indexNowHookDeps } from '@/collections/Posts/indexnow'
import { indexNowDeps, INDEXNOW_ENDPOINT } from '@/indexnow'
import { INDEXNOW_SUBMIT_TASK } from '@/jobs/constants'
import type { Category, Post } from '@/payload-types'

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
 * OBLOG-57 — Postgres bilan: posts hook'lari → `indexnow.submit` job'i → IndexNow so'rovi
 * (soxta `fetch`), va standart muallif (`authors` bo'sh bo'lsa — "tahririyat").
 *
 * `after()` test muhitida yo'q — `indexNowHookDeps.runAfter` vazifalarni yig'adi, `flushAfter()`
 * ularni "javobdan keyin" bajaradi (Telegram testi bilan bir xil).
 */
const KEY = 'test-indexnow-key-0123456789'
const ORIGIN = 'https://blog.odya.uz'

let payload: Payload
let users: TestUsers
let category: Category
const originalDeps = { ...indexNowDeps }
const originalRunAfter = indexNowHookDeps.runAfter
const afterQueue: (() => Promise<void>)[] = []
const requests: Array<{ url: string; body: { urlList: string[]; key: string; host: string } }> = []

async function flushAfter() {
  while (afterQueue.length) await afterQueue.shift()!()
}

async function pendingJobs() {
  const { docs } = await payload.find({
    collection: 'payload-jobs',
    where: { taskSlug: { equals: INDEXNOW_SUBMIT_TASK } },
    depth: 0,
    limit: 50,
  })
  return docs
}

async function update(id: number, data: Partial<Post>, draft = false, user = users.editor) {
  return payload.update({ collection: 'posts', id, data, draft, ...as(user) })
}

async function newPost(slug = testSlug('inow'), context?: Record<string, unknown>) {
  return payload.create({
    collection: 'posts',
    data: { title: 'IndexNow sinovi', slug, category: category.id, workflowStatus: 'draft' },
    ...(context ? { context } : {}),
    ...as(users.editor),
  })
}

async function publishNew(context?: Record<string, unknown>) {
  const post = await newPost(undefined, context)
  await update(post.id, { workflowStatus: 'in_progress' })
  await update(post.id, { workflowStatus: 'review' })
  return update(post.id, { _status: 'published' })
}

const urlsOf = (slug: string, categorySlug = category.slug) => [
  `${ORIGIN}/${categorySlug}/${slug}`,
  `${ORIGIN}/kr/${categorySlug}/${slug}`,
]

beforeAll(async () => {
  payload = await initTestPayload()
  await deleteTestContent(payload)
  await deleteTestUsers(payload)
  await payload.delete({
    collection: 'payload-jobs',
    where: { taskSlug: { equals: INDEXNOW_SUBMIT_TASK } },
  })
  users = await createTestUsers(payload)
  category = await createTestCategory(payload)

  indexNowDeps.key = () => KEY
  indexNowDeps.origin = () => ORIGIN
  indexNowDeps.indexingAllowed = () => true
  indexNowDeps.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    return new Response(null, { status: 200 })
  }) as typeof fetch
  indexNowHookDeps.runAfter = (task) => {
    afterQueue.push(task)
    return true
  }
})

afterAll(async () => {
  Object.assign(indexNowDeps, originalDeps)
  indexNowHookDeps.runAfter = originalRunAfter
  if (payload) {
    await deleteTestContent(payload)
    await payload.delete({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: INDEXNOW_SUBMIT_TASK } },
    })
    await deleteTestUsers(payload)
  }
  await payload?.db?.destroy?.()
})

describe('IndexNow: posts → indexnow.submit', () => {
  beforeEach(async () => {
    requests.length = 0
    afterQueue.length = 0
    indexNowDeps.key = () => KEY
    await payload.delete({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: INDEXNOW_SUBMIT_TASK } },
    })
  })

  it('publish → lotin + /kr URL’lari IndexNow’ga (after() bilan darhol)', async () => {
    const post = await publishNew()
    const jobs = await pendingJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.input).toMatchObject({ urls: urlsOf(post.slug) })
    expect(afterQueue).toHaveLength(1)

    await flushAfter()
    expect(requests).toEqual([
      {
        url: INDEXNOW_ENDPOINT,
        body: {
          host: 'blog.odya.uz',
          key: KEY,
          keyLocation: `${ORIGIN}/${KEY}.txt`,
          urlList: urlsOf(post.slug),
        },
      },
    ])
    // Muvaffaqiyatli job o'chiriladi (`deleteJobOnComplete`).
    expect(await pendingJobs()).toHaveLength(0)
  })

  it('qoralama/autosave va o‘zgarishsiz qayta chop etish — so‘rov yo‘q', async () => {
    const post = await publishNew()
    await payload.delete({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: INDEXNOW_SUBMIT_TASK } },
    })
    afterQueue.length = 0

    await update(post.id, { title: 'Qoralama sarlavha' }, true)
    await update(post.id, { title: 'Chop etilgan yangi sarlavha', _status: 'published' })
    expect(await pendingJobs()).toHaveLength(0)
    expect(afterQueue).toHaveLength(0)
  })

  it('slug o‘zgardi (publish) — yangi va eski URL’lar', async () => {
    const post = await publishNew()
    await payload.delete({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: INDEXNOW_SUBMIT_TASK } },
    })
    const newSlug = testSlug('inow-new')
    await update(post.id, { slug: newSlug, _status: 'published' })
    const jobs = await pendingJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.input).toMatchObject({
      urls: [...urlsOf(newSlug), ...urlsOf(post.slug)],
    })
  })

  it('unpublish va arxivlash — eski URL’lar', async () => {
    const post = await publishNew()
    await payload.delete({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: INDEXNOW_SUBMIT_TASK } },
    })
    // Unpublish: asosiy hujjat qoralamaga (draft rejimisiz saqlash).
    await update(post.id, { _status: 'draft' })
    let jobs = await pendingJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.input).toMatchObject({ urls: urlsOf(post.slug) })

    const other = await publishNew()
    await payload.delete({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: INDEXNOW_SUBMIT_TASK } },
    })
    await update(other.id, { workflowStatus: 'archived', _status: 'published' }, false, users.admin)
    jobs = await pendingJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.input).toMatchObject({ urls: urlsOf(other.slug) })
  })

  it('INDEXNOW_KEY yo‘q — job qo‘yilmaydi (faqat warning)', async () => {
    indexNowDeps.key = () => undefined
    await publishNew()
    expect(await pendingJobs()).toHaveLength(0)
    expect(afterQueue).toHaveLength(0)
  })
})

describe('Standart muallif (E-E-A-T, TZ §8.2)', () => {
  beforeAll(() => {
    // IndexNow bu testlarda kerak emas.
    indexNowDeps.key = () => undefined
  })

  async function defaultAuthorId() {
    const { docs } = await payload.find({
      collection: 'authors',
      where: { slug: { equals: DEFAULT_AUTHOR_SLUG } },
      depth: 0,
      limit: 2,
    })
    expect(docs).toHaveLength(1)
    return docs[0]!.id
  }

  it('yangi post (MCP / "Qoralamaga olish" / admin) — muallif bo‘sh bo‘lsa "tahririyat"', async () => {
    const post = await newPost()
    const authorId = await defaultAuthorId()
    expect(
      post.authors?.map((author) => (typeof author === 'object' ? author.id : author)),
    ).toEqual([authorId])
  })

  it('standart muallif hujjati yo‘q bo‘lsa — bir marta yaratiladi (lotin + kirill)', async () => {
    const existing = await defaultAuthorId()
    const parked = testSlug('parked-tahririyat')
    // Hook'larsiz (redirect yozuvisiz) vaqtincha boshqa slug'ga.
    await payload.db.updateOne({
      collection: 'authors',
      id: existing,
      data: { slug: parked },
      returning: false,
    })
    try {
      const post = await newPost()
      const created = await defaultAuthorId()
      expect(created).not.toBe(existing)
      expect(post.authors?.map((item) => (typeof item === 'object' ? item.id : item))).toEqual([
        created,
      ])
      const cyrl = await payload.findByID({
        collection: 'authors',
        id: created,
        locale: 'uz-Cyrl',
        depth: 0,
      })
      expect(cyrl.name).toBe('Блог Одя таҳририяти')
      await payload.delete({ collection: 'posts', id: post.id })
      await payload.delete({ collection: 'authors', id: created })
    } finally {
      await payload.db.updateOne({
        collection: 'authors',
        id: existing,
        data: { slug: DEFAULT_AUTHOR_SLUG },
        returning: false,
      })
    }
    expect(await defaultAuthorId()).toBe(existing)
  })

  it('muallifsiz post chop etilganda standart muallif oladi; tanlangan muallif saqlanadi', async () => {
    const authorId = await defaultAuthorId()
    const published = await publishNew({ skipDefaultAuthor: true })
    const ids = (published.authors ?? []).map((author) =>
      typeof author === 'object' ? author.id : author,
    )
    expect(ids).toEqual([authorId])

    const author = await payload.create({
      collection: 'authors',
      data: { name: 'Sinov muallifi', slug: testSlug('author') },
    })
    const own = await payload.create({
      collection: 'posts',
      data: {
        title: 'O‘z muallifi',
        slug: testSlug('inow-own'),
        category: category.id,
        workflowStatus: 'draft',
        authors: [author.id],
      },
      ...as(users.editor),
    })
    expect(own.authors?.map((item) => (typeof item === 'object' ? item.id : item))).toEqual([
      author.id,
    ])
  })
})
