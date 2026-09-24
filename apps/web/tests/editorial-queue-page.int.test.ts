import { createLocalReq, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { takeScrapedItem } from '@/editorial/actions'
import { localDate, type QueueFilters } from '@/editorial/queue'
import { loadQueuePage } from '@/editorial/queuePage'
import type { Category, ScrapedItem, Source, User } from '@/payload-types'

import {
  createTestCategory,
  createTestUsers,
  deleteTestContent,
  TEST_SLUG_PREFIX,
  testSlug,
  type TestUsers,
} from './helpers/content'
import { asUser, deleteTestUsers, initTestPayload } from './helpers/payload'

/**
 * Tahririyat navbati sahifalash (OBLOG-40): `loadQueuePage` — Docker Postgres bilan. Test
 * elementlari alohida test manbasiga bog'lanadi va `source` filtri bilan ajratiladi.
 */
let payload: Payload
let users: TestUsers
let category: Category
let source: Source
let counter = 0

const URL_PREFIX = 'https://queue-page-test.example/'

async function newItem(extra: Partial<ScrapedItem> = {}): Promise<ScrapedItem> {
  counter += 1
  const url = `${URL_PREFIX}${Date.now()}-${counter}`
  return payload.create({
    collection: 'scraped-items',
    data: {
      title: `Test m102 queue page ${counter}`,
      source: source.id,
      status: 'scraped',
      url,
      urlHash: `queue-page-test-${url}`,
      excerpt: 'RSS qisqa matni',
      suggestedCategory: category.id,
      ...extra,
    },
  })
}

function reqFor(user: User | null): Promise<PayloadRequest> {
  return createLocalReq(user ? { user: asUser(user) } : {}, payload)
}

function filters(extra: Partial<QueueFilters> = {}): QueueFilters {
  return { date: localDate(), status: 'all', source: source.id, ...extra }
}

async function load(extra: Partial<QueueFilters>, page: number, limit: number) {
  return loadQueuePage({
    req: await reqFor(users.editor),
    filters: filters(extra),
    pagination: { page, limit },
  })
}

const ids = (data: Awaited<ReturnType<typeof load>>) =>
  data.groups.map((group) => group.items.map((item) => item.id))

async function cleanup() {
  await payload.delete({ collection: 'scraped-items', where: { url: { like: URL_PREFIX } } })
  await deleteTestContent(payload)
  await payload.delete({ collection: 'sources', where: { slug: { like: TEST_SLUG_PREFIX } } })
  await deleteTestUsers(payload)
}

describe('tahririyat navbati: sahifalash (loadQueuePage)', () => {
  // score bo'yicha tartib: s90, s80(klaster a), s70, s60, s50(klaster a), s40, rejected s30.
  const created: Record<string, ScrapedItem> = {}

  beforeAll(async () => {
    payload = await initTestPayload()
    await cleanup()
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
    source = await payload.create({
      collection: 'sources',
      data: {
        name: 'Queue page test manba',
        slug: testSlug('src'),
        homepageUrl: URL_PREFIX,
        feeds: [{ url: `${URL_PREFIX}feed.xml` }],
        language: 'en',
        fetchMode: 'rss_only',
      },
    })
    created.s90 = await newItem({ score: 90, extractedText: '# Sarlavha\n\nTo‘liq **matn**' })
    created.s80 = await newItem({ score: 80, clusterId: 'queue-page-a' })
    created.s70 = await newItem({ score: 70 })
    created.s60 = await newItem({ score: 60 })
    created.s50 = await newItem({ score: 50, clusterId: 'queue-page-a' })
    created.s40 = await newItem({ score: 40 })
    created.s30 = await newItem({ score: 30, status: 'rejected', rejectReason: 'eski' })
  })

  afterAll(async () => {
    if (payload) await cleanup()
    await payload?.db?.destroy?.()
  })

  it('sahifalar: guruhlar bo‘yicha, klaster bo‘linmaydi, jami va sahifa ma’lumotlari', async () => {
    const page1 = await load({}, 1, 2)
    expect(page1.totalDocs).toBe(7)
    expect(page1.truncated).toBe(false)
    // 7 element, klaster a (2 ta) — 6 guruh → 3 sahifa.
    expect(page1.pageInfo).toEqual({
      page: 1,
      limit: 2,
      totalPages: 3,
      totalGroups: 6,
      hasPrevPage: false,
      hasNextPage: true,
      prevPage: null,
      nextPage: 2,
    })
    expect(ids(page1)).toEqual([[created.s90.id], [created.s80.id, created.s50.id]])

    const page2 = await load({}, 2, 2)
    expect(ids(page2)).toEqual([[created.s70.id], [created.s60.id]])
    expect(page2.pageInfo).toMatchObject({ page: 2, hasPrevPage: true, hasNextPage: true })

    const page3 = await load({}, 3, 2)
    expect(ids(page3)).toEqual([[created.s40.id], [created.s30.id]])
    expect(page3.pageInfo).toMatchObject({ page: 3, hasNextPage: false, nextPage: null })
  })

  it('chegaradan tashqari sahifa — oxirgi sahifa', async () => {
    const data = await load({}, 99, 2)
    expect(data.pageInfo.page).toBe(3)
    expect(ids(data)).toEqual([[created.s40.id], [created.s30.id]])
  })

  it('filtr + sahifalash: holat filtri jami va sahifalarni o‘zgartiradi', async () => {
    const open = await load({ status: 'new' }, 1, 25)
    expect(open.totalDocs).toBe(6)
    expect(open.pageInfo.totalPages).toBe(1)
    expect(ids(open).flat()).not.toContain(created.s30.id)

    const rejected = await load({ status: 'rejected' }, 5, 25)
    expect(rejected.totalDocs).toBe(1)
    expect(rejected.pageInfo.page).toBe(1)
    expect(ids(rejected)).toEqual([[created.s30.id]])
    expect(rejected.groups[0].items[0]).toMatchObject({
      status: 'rejected',
      rejectReason: 'eski',
    })

    const otherDay = await load({ date: '2020-01-01' }, 1, 25)
    expect(otherDay.totalDocs).toBe(0)
    expect(otherDay.groups).toEqual([])
    expect(otherDay.pageInfo).toMatchObject({ page: 1, totalPages: 1, totalGroups: 0 })
  })

  it('qator ma’lumotlari: manba/kategoriya nomi, post sarlavhasi, qisqa matn (to‘liq matnsiz)', async () => {
    await takeScrapedItem(await reqFor(users.editor), { id: created.s70.id })
    const data = await load({}, 1, 25)
    const rows = data.groups.flatMap((group) => group.items)
    const top = rows.find((row) => row.id === created.s90.id)!
    expect(top).toMatchObject({
      source: { id: source.id, name: 'Queue page test manba' },
      suggestedCategory: { id: category.id, name: 'Test kategoriya' },
      text: 'Sarlavha To‘liq matn',
      post: null,
    })
    expect(top).not.toHaveProperty('extractedText')
    const taken = rows.find((row) => row.id === created.s70.id)!
    expect(taken.status).toBe('drafted')
    expect(taken.post).toMatchObject({ title: created.s70.title })
    expect(data.hasScore).toBe(true)
    expect(data.hasClusters).toBe(true)
    expect(data.sources.some((s) => s.id === source.id)).toBe(true)
  })

  it('scanLimit oshib ketsa — truncated', async () => {
    const data = await loadQueuePage({
      req: await reqFor(users.editor),
      filters: filters(),
      pagination: { page: 1, limit: 25 },
      scanLimit: 3,
    })
    expect(data.totalDocs).toBe(7)
    expect(data.truncated).toBe(true)
    expect(data.pageInfo.totalGroups).toBeLessThanOrEqual(3)
  })

  it('anonim — 403', async () => {
    await expect(
      loadQueuePage({
        req: await reqFor(null),
        filters: filters(),
        pagination: { page: 1, limit: 25 },
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
