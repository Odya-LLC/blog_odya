import { createLocalReq, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { rejectScrapedItem, takeScrapedItem } from '@/editorial/actions'
import { scrapedItemEndpoints } from '@/editorial/endpoints'
import { buildQueueWhere, localDate } from '@/editorial/queue'
import { getEditorialStats } from '@/editorial/stats'
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
 * Tahririyat navbati (M2-04): "Qoralamaga olish" / "Rad etish" — servis va custom endpoint'lar,
 * Docker Postgres bilan. Access (anonim — 401), idempotentlik (parallel so'rovlar ham),
 * tranzaksiya (xatoda element holati o'zgarmaydi).
 */
let payload: Payload
let users: TestUsers
let category: Category
let otherCategory: Category
let source: Source
let counter = 0

const URL_PREFIX = 'https://editorial-test.example/'

async function newItem(extra: Partial<ScrapedItem> = {}): Promise<ScrapedItem> {
  counter += 1
  const url = `${URL_PREFIX}${Date.now()}-${counter}`
  return payload.create({
    collection: 'scraped-items',
    data: {
      // Sarlavhadan yasalgan post slug'i test prefiksi bilan boshlanadi (tozalash uchun).
      title: `Test m102 editorial ${Date.now()} ${counter}`,
      source: source.id,
      status: 'pending',
      url,
      urlHash: `editorial-test-${url}`,
      excerpt: 'RSS qisqa matni',
      suggestedCategory: category.id,
      ...extra,
    },
  })
}

function reqFor(user: User | null): Promise<PayloadRequest> {
  return createLocalReq(user ? { user: asUser(user) } : {}, payload)
}

async function getItem(id: number): Promise<ScrapedItem> {
  return payload.findByID({ collection: 'scraped-items', id, depth: 0 })
}

async function postsFor(itemId: number) {
  const { docs } = await payload.find({
    collection: 'posts',
    where: { 'sources.scrapedItem': { equals: itemId } },
    draft: true,
    depth: 0,
    pagination: false,
  })
  return docs
}

/** Custom endpoint'ni Payload REST marshrutisiz chaqirish (routeParams + JSON body). */
async function callEndpoint(
  action: 'take' | 'reject',
  id: number | string,
  body: unknown,
  user: User | null,
) {
  const endpoint = scrapedItemEndpoints.find((e) => e.path === `/:id/${action}`)!
  const req = await reqFor(user)
  req.routeParams = { id: String(id) }
  req.json = async () => body
  const response = await endpoint.handler(req)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON javobini testda erkin tekshiramiz
  return { status: response.status, body: (await response.json()) as Record<string, any> }
}

const expectStatus = (promise: Promise<unknown>, status: number) =>
  expect(promise).rejects.toMatchObject({ status })

describe('tahririyat navbati: qoralamaga olish va rad etish', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await cleanup()
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
    otherCategory = await createTestCategory(payload)
    source = await payload.create({
      collection: 'sources',
      data: {
        name: 'Editorial test manba',
        slug: testSlug('src'),
        homepageUrl: URL_PREFIX,
        feeds: [{ url: `${URL_PREFIX}feed.xml` }],
        language: 'en',
        fetchMode: 'rss_only',
      },
    })
  })

  async function cleanup() {
    await payload.delete({
      collection: 'scraped-items',
      where: { url: { like: URL_PREFIX } },
    })
    await deleteTestContent(payload)
    await payload.delete({ collection: 'sources', where: { slug: { like: TEST_SLUG_PREFIX } } })
    await deleteTestUsers(payload)
  }

  afterAll(async () => {
    if (payload) await cleanup()
    await payload?.db?.destroy?.()
  })

  it('anonim: servis va endpoint — 401, element o‘zgarmaydi', async () => {
    const item = await newItem()
    await expectStatus(takeScrapedItem(await reqFor(null), { id: item.id }), 401)
    await expectStatus(rejectScrapedItem(await reqFor(null), { id: item.id, reason: 'x' }), 401)

    const take = await callEndpoint('take', item.id, {}, null)
    expect(take.status).toBe(401)
    const reject = await callEndpoint('reject', item.id, { reason: 'x' }, null)
    expect(reject.status).toBe(401)

    expect((await getItem(item.id)).status).toBe('pending')
    expect(await postsFor(item.id)).toHaveLength(0)
  })

  it('Local API: anonim scraped-items ni o‘qiy/o‘zgartira olmaydi', async () => {
    const item = await newItem()
    await expectStatus(
      payload.update({
        collection: 'scraped-items',
        id: item.id,
        data: { status: 'rejected' },
        overrideAccess: false,
      }),
      403,
    )
  })

  it('qoralamaga olish: draft post (atributsiya, kategoriya, assignee), element → drafted', async () => {
    const item = await newItem()
    const result = await takeScrapedItem(await reqFor(users.editor), { id: item.id })
    expect(result.created).toBe(true)

    const post = await payload.findByID({
      collection: 'posts',
      id: result.post.id,
      draft: true,
      depth: 0,
    })
    expect(post.workflowStatus).toBe('draft')
    expect(post._status).toBe('draft')
    expect(post.title).toBe(item.title)
    expect(post.slug.startsWith(TEST_SLUG_PREFIX)).toBe(true)
    expect(post.category).toBe(category.id)
    expect(post.assignee).toBe(users.editor.id)
    expect(post.rewrittenBy).toBe('human')
    expect(post.sources).toEqual([
      expect.objectContaining({ name: source.name, url: item.url, scrapedItem: item.id }),
    ])

    const updated = await getItem(item.id)
    expect(updated.status).toBe('drafted')
    expect(updated.post).toBe(post.id)
    expect(updated.handledBy).toBe(users.editor.id)
    expect(updated.handledAt).toBeTruthy()
  })

  it('idempotent: qayta olish yangi post yaratmaydi (boshqa editor ham)', async () => {
    const item = await newItem()
    const first = await takeScrapedItem(await reqFor(users.editor), { id: item.id })
    const again = await takeScrapedItem(await reqFor(users.editor2), { id: item.id })
    expect(again.created).toBe(false)
    expect(again.post.id).toBe(first.post.id)
    expect(await postsFor(item.id)).toHaveLength(1)
    // Birinchi olgan editor mas'ul bo'lib qoladi.
    expect((await getItem(item.id)).handledBy).toBe(users.editor.id)
  })

  it('parallel so‘rovlar (qator qulfi): bitta post', async () => {
    const item = await newItem()
    const [a, b] = await Promise.all([
      takeScrapedItem(await reqFor(users.editor), { id: item.id }),
      takeScrapedItem(await reqFor(users.editor2), { id: item.id }),
    ])
    expect(a.post.id).toBe(b.post.id)
    expect([a.created, b.created].sort()).toEqual([false, true])
    expect(await postsFor(item.id)).toHaveLength(1)
  })

  it('tanlangan kategoriya taklifdan ustun; kategoriya umuman bo‘lmasa — 400', async () => {
    const item = await newItem()
    const result = await takeScrapedItem(await reqFor(users.admin), {
      id: item.id,
      categoryId: otherCategory.id,
    })
    const post = await payload.findByID({ collection: 'posts', id: result.post.id, draft: true })
    expect(typeof post.category === 'object' ? post.category.id : post.category).toBe(
      otherCategory.id,
    )

    const bare = await newItem({ suggestedCategory: null })
    await expectStatus(takeScrapedItem(await reqFor(users.editor), { id: bare.id }), 400)
    expect((await getItem(bare.id)).status).toBe('pending')
  })

  it('tranzaksiya: post yaratish xato bersa element holati o‘zgarmaydi', async () => {
    const item = await newItem()
    await expect(
      takeScrapedItem(await reqFor(users.editor), { id: item.id, categoryId: 99_999_999 }),
    ).rejects.toBeTruthy()
    const fresh = await getItem(item.id)
    expect(fresh.status).toBe('pending')
    expect(fresh.post ?? null).toBeNull()
    expect(await postsFor(item.id)).toHaveLength(0)
  })

  it('slug to‘qnashuvi: bir xil sarlavhali ikkinchi element — slug oxirida element id', async () => {
    const title = `Test m102 same title ${Date.now()}`
    const a = await newItem({ title })
    const b = await newItem({ title })
    const ra = await takeScrapedItem(await reqFor(users.editor), { id: a.id })
    const rb = await takeScrapedItem(await reqFor(users.editor), { id: b.id })
    expect(rb.post.slug).toBe(`${ra.post.slug}-${b.id}`)
  })

  it('rad etish: sabab majburiy; rad etilgan element navbatdan yo‘qoladi', async () => {
    const item = await newItem()
    await expectStatus(
      rejectScrapedItem(await reqFor(users.editor), { id: item.id, reason: ' ' }),
      400,
    )
    await expectStatus(
      rejectScrapedItem(await reqFor(users.editor), { id: item.id, reason: 'x'.repeat(1001) }),
      400,
    )

    const where = buildQueueWhere({ date: localDate(), status: 'new', source: source.id })
    const inQueue = async () =>
      (await payload.find({ collection: 'scraped-items', where, pagination: false, depth: 0 })).docs
        .map((doc) => doc.id)
        .includes(item.id)
    expect(await inQueue()).toBe(true)

    const result = await rejectScrapedItem(await reqFor(users.editor), {
      id: item.id,
      reason: 'Ahamiyatsiz',
    })
    expect(result.changed).toBe(true)
    const fresh = await getItem(item.id)
    expect(fresh.status).toBe('rejected')
    expect(fresh.rejectReason).toBe('Ahamiyatsiz')
    expect(fresh.handledBy).toBe(users.editor.id)
    expect(await inQueue()).toBe(false)

    const again = await rejectScrapedItem(await reqFor(users.editor2), {
      id: item.id,
      reason: 'Yana',
    })
    expect(again.changed).toBe(false)
    expect((await getItem(item.id)).rejectReason).toBe('Ahamiyatsiz')

    await expectStatus(takeScrapedItem(await reqFor(users.editor), { id: item.id }), 409)
  })

  it('qoralamaga olingan elementni rad etib bo‘lmaydi — 409', async () => {
    const item = await newItem()
    await takeScrapedItem(await reqFor(users.editor), { id: item.id })
    await expectStatus(
      rejectScrapedItem(await reqFor(users.editor), { id: item.id, reason: 'x' }),
      409,
    )
    expect((await getItem(item.id)).status).toBe('drafted')
  })

  it('endpoint: take → 200 + editUrl, reject → 200; noto‘g‘ri id — 400, yo‘q element — 404', async () => {
    const item = await newItem()
    const take = await callEndpoint('take', item.id, { categoryId: category.id }, users.editor)
    expect(take.status).toBe(200)
    expect(take.body.created).toBe(true)
    expect(take.body.editUrl).toBe(`/admin/collections/posts/${take.body.post.id}`)
    expect(take.body.item.status).toBe('drafted')

    const other = await newItem()
    const reject = await callEndpoint('reject', other.id, { reason: 'Reklama' }, users.editor)
    expect(reject.status).toBe(200)
    expect(reject.body.item.status).toBe('rejected')

    expect((await callEndpoint('take', 'abc', {}, users.editor)).status).toBe(400)
    expect((await callEndpoint('take', item.id, { categoryId: 'x' }, users.editor)).status).toBe(
      400,
    )
    const missing = await callEndpoint('take', 99_999_999, {}, users.editor)
    expect(missing.status).toBe(404)
    expect(missing.body.errors[0].message).toContain('topilmadi')
    expect((await callEndpoint('reject', other.id, {}, users.editor)).status).toBe(400)
  })

  it('dashboard statistikasi: bugungi yig‘ilgan va qoralamalar soni oshadi', async () => {
    const before = await getEditorialStats(payload, asUser(users.editor))
    const item = await newItem()
    await takeScrapedItem(await reqFor(users.editor), { id: item.id })
    const after = await getEditorialStats(payload, asUser(users.editor))
    expect(after.date).toBe(localDate())
    expect(after.scraped).toBe(before.scraped + 1)
    expect(after.drafts).toBe(before.drafts + 1)
  })
})
