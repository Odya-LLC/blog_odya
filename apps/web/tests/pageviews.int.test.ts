import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { localDate } from '@/editorial/queue'
import { getEditorialStats } from '@/editorial/stats'
import { runCleanup } from '@/jobs/tasks/maintenanceCleanup'
import { VIEW_COOKIE } from '@/pageviews/dedupe'
import { VIEW_COUNT_CACHE_CONTROL } from '@/pageviews/beacon'
import { handleViewCountRequest, handleViewRequest } from '@/pageviews/handler'
import { resolvePopular } from '@/pageviews/popular'
import {
  deleteOldDailyViews,
  insertViews,
  loadPopularRows,
  loadPublicViews,
  loadTotalViews,
  recordView,
  shiftDate,
  VIEWS_DAILY_RETENTION_DAYS,
} from '@/pageviews/store'
import type { Category, Post } from '@/payload-types'
import { loadPopularData } from '@/site/data'
import { setRevalidator } from '@/site/revalidate'

import {
  as,
  createTestCategory,
  createTestUsers,
  deleteTestContent,
  testSlug,
  type TestUsers,
} from './helpers/content'
import { asUser, deleteTestUsers, initTestPayload } from './helpers/payload'

/**
 * OBLOG-69 Postgres bilan: `POST /api/views` mantiqi (haqiqiy `recordView`) → kunlik va jami
 * hisoblagich, dedupe cookie, chop etilmagan/noma'lum post, botlar; reyting oynalari; admin
 * `viewsTotal` maydoni; `maintenance.cleanup` eski kunlarni o'chiradi.
 */

let payload: Payload
let users: TestUsers
let category: Category
const BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

function db() {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

async function daily(postId: number): Promise<Array<{ day: string; views: number }>> {
  const result = (await db().execute(
    sql`SELECT to_char("day", 'YYYY-MM-DD') AS "day", "views" FROM "post_views_daily" WHERE "post_id" = ${postId} ORDER BY "day"`,
  )) as unknown as { rows: Array<{ day: string; views: number }> }
  return result.rows.map((row) => ({ day: row.day, views: Number(row.views) }))
}

async function createPost(name: string, publish: boolean): Promise<Post> {
  const editor = as(users.editor)
  const post = await payload.create({
    collection: 'posts',
    data: {
      title: `Koʻrishlar testi ${name}`,
      slug: testSlug(`pv-${name}`),
      category: category.id,
      workflowStatus: 'draft',
    },
    ...editor,
  })
  if (!publish) return post
  await payload.update({
    collection: 'posts',
    id: post.id,
    data: { workflowStatus: 'in_progress' },
    ...editor,
  })
  await payload.update({ collection: 'posts', id: post.id, data: { workflowStatus: 'review' } })
  return payload.update({
    collection: 'posts',
    id: post.id,
    data: { _status: 'published' },
    ...editor,
  })
}

function beacon(postId: number, headers: Record<string, string> = {}) {
  return handleViewRequest(
    new Request('http://localhost:3100/api/views', {
      method: 'POST',
      body: String(postId),
      headers: { 'user-agent': BROWSER, 'sec-fetch-site': 'same-origin', ...headers },
    }),
    { record: (id) => recordView(payload, id) },
  )
}

describe('ko‘rishlar hisoblagichi (Postgres)', () => {
  let published: Post
  let draft: Post

  beforeAll(async () => {
    payload = await initTestPayload()
    setRevalidator(() => {})
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
    published = await createPost('published', true)
    draft = await createPost('draft', false)
  })

  afterAll(async () => {
    setRevalidator(null)
    if (payload) {
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
      await payload.db?.destroy?.()
    }
  })

  it('POST → kunlik va jami oshadi; cookie bilan takror — yo‘q; yangi tashrifchi — ha', async () => {
    const first = await beacon(published.id)
    expect(first.outcome).toBe('counted')
    expect(first.response.status).toBe(204)
    const cookie = first.response.headers.get('set-cookie')!.split(';')[0]!
    expect(cookie.startsWith(`${VIEW_COOKIE}=${published.id}-`)).toBe(true)

    const repeat = await beacon(published.id, { cookie })
    expect(repeat.outcome).toBe('duplicate')

    expect((await beacon(published.id)).outcome).toBe('counted')
    expect(await daily(published.id)).toEqual([{ day: localDate(), views: 2 }])
    expect(await loadTotalViews(payload, published.id)).toBe(2)
  })

  it('chop etilmagan / noma’lum post — 204, hech narsa yozilmaydi', async () => {
    const unpublished = await beacon(draft.id)
    expect(unpublished.outcome).toBe('unknown')
    expect(unpublished.response.status).toBe(204)
    expect(await daily(draft.id)).toEqual([])
    expect((await beacon(2_000_000_000)).outcome).toBe('unknown')
  })

  it('botlar va begona sayt hisoblanmaydi', async () => {
    const before = await loadTotalViews(payload, published.id)
    expect((await beacon(published.id, { 'user-agent': 'Googlebot/2.1' })).outcome).toBe('bot')
    expect((await beacon(published.id, { 'sec-fetch-site': 'cross-site' })).outcome).toBe(
      'cross-site',
    )
    expect(await loadTotalViews(payload, published.id)).toBe(before)
  })

  it('arxivlangan post hisoblanmaydi', async () => {
    const archived = await createPost('archived', true)
    await payload.update({
      collection: 'posts',
      id: archived.id,
      data: { workflowStatus: 'archived' },
    })
    expect(await recordView(payload, archived.id)).toBe('unknown')
  })

  it('GET /api/views?id= (OBLOG-72): chop etilgan — {views}, CDN keshi; qolganlari — 404', async () => {
    const get = (id: number) =>
      handleViewCountRequest(new Request(`http://localhost:3100/api/views?id=${id}`), {
        load: (postId) => loadPublicViews(payload, postId),
      })
    const total = await loadTotalViews(payload, published.id)
    expect(total).toBeGreaterThan(0)
    const ok = await get(published.id)
    expect(ok.response.status).toBe(200)
    expect(ok.response.headers.get('cache-control')).toBe(VIEW_COUNT_CACHE_CONTROL)
    expect(ok.response.headers.get('set-cookie')).toBeNull()
    expect(await ok.response.json()).toEqual({ views: total })
    // GET hech narsa yozmaydi.
    expect(await loadTotalViews(payload, published.id)).toBe(total)

    const fresh = await createPost('count-fresh', true)
    expect(await (await get(fresh.id)).response.json()).toEqual({ views: 0 })

    expect((await get(draft.id)).response.status).toBe(404)
    expect((await get(2_000_000_000)).response.status).toBe(404)
    const archived = await createPost('count-archived', true)
    await insertViews(payload, [{ postId: archived.id, day: localDate(), views: 50 }])
    expect(await loadPublicViews(payload, archived.id)).toBe(50)
    await payload.update({
      collection: 'posts',
      id: archived.id,
      data: { workflowStatus: 'archived' },
    })
    expect(await loadPublicViews(payload, archived.id)).toBeNull()
    expect((await get(archived.id)).response.status).toBe(404)
  })

  it('reyting: 7 kun, 30 kun va butun davr oynalari, tartib to‘g‘ri', async () => {
    const today = localDate()
    const a = await createPost('rank-a', true)
    const b = await createPost('rank-b', true)
    const c = await createPost('rank-c', true)
    const d = await createPost('rank-d', true)
    await insertViews(payload, [
      { postId: a.id, day: today, views: 500_000 },
      { postId: b.id, day: shiftDate(today, 3), views: 400_000 },
      { postId: b.id, day: shiftDate(today, 20), views: 300_000 },
      { postId: c.id, day: shiftDate(today, 20), views: 900_000 },
      { postId: d.id, day: shiftDate(today, 200), views: 2_000_000 },
    ])
    const rows = await loadPopularRows(payload, { limit: 1000 })
    const ids = (window: string) =>
      rows
        .filter((row) => row.window === window && [a, b, c, d].some((p) => p.id === row.id))
        .map((row) => [row.id, row.views])
    expect(ids('week')).toEqual([
      [a.id, 500_000],
      [b.id, 400_000],
    ])
    expect(ids('month')).toEqual([
      [c.id, 900_000],
      [b.id, 700_000],
      [a.id, 500_000],
    ])
    expect(ids('all')).toEqual([
      [d.id, 2_000_000],
      [c.id, 900_000],
      [b.id, 700_000],
      [a.id, 500_000],
    ])
    // Chop etilmagan post reytingga kirmaydi.
    await insertViews(payload, [{ postId: draft.id, day: today, views: 9_000_000 }])
    const again = await loadPopularRows(payload, { limit: 1000 })
    expect(again.some((row) => row.id === draft.id)).toBe(false)

    // Sayt ma'lumoti: kartochkalar (kirill URL bilan) va joriy maqolasiz tanlov.
    const data = await loadPopularData('uz-Cyrl')
    const list = resolvePopular(data.rows, data.posts, { exclude: a.id })
    expect(list?.window).toBe('week')
    expect(list?.items[0]?.post.id).not.toBe(a.id)
    expect(data.posts.find((post) => post.id === c.id)?.href).toMatch(/^\/kr\//)
  })

  it('admin: viewsTotal (virtual) — foydalanuvchiga ko‘rinadi, anonimga emas', async () => {
    const asEditor = await payload.findByID({
      collection: 'posts',
      id: published.id,
      overrideAccess: false,
      user: asUser(users.editor),
    })
    expect(asEditor.viewsTotal).toBe(await loadTotalViews(payload, published.id))
    const anon = await payload.findByID({
      collection: 'posts',
      id: published.id,
      overrideAccess: false,
    })
    expect(anon.viewsTotal ?? null).toBeNull()
    // Admin'dan saqlash qiymatni qayta yozmaydi (virtual + update access yo'q).
    await payload.update({
      collection: 'posts',
      id: published.id,
      data: { viewsTotal: 0, excerpt: 'Yangilangan lid' } as never,
      overrideAccess: false,
      user: asUser(users.editor),
    })
    expect(await loadTotalViews(payload, published.id)).toBe(asEditor.viewsTotal)
  })

  it('dashboard: bugungi ko‘rishlar', async () => {
    const before = await getEditorialStats(payload, asUser(users.editor))
    await recordView(payload, published.id)
    const after = await getEditorialStats(payload, asUser(users.editor))
    expect(after.views).toBe(before.views + 1)
  })

  it('maintenance.cleanup: 90 kundan eski kunlik qatorlar o‘chadi, jami qoladi', async () => {
    const old = await createPost('old', true)
    const today = localDate()
    await insertViews(payload, [
      { postId: old.id, day: shiftDate(today, VIEWS_DAILY_RETENTION_DAYS + 5), views: 10 },
      { postId: old.id, day: shiftDate(today, VIEWS_DAILY_RETENTION_DAYS - 1), views: 3 },
    ])
    const output = await runCleanup(payload, { now: () => Date.now(), lister: null })
    expect(output.deletedViewDays).toBeGreaterThanOrEqual(1)
    expect((await daily(old.id)).map((row) => row.views)).toEqual([3])
    expect(await loadTotalViews(payload, old.id)).toBe(13)
    expect(await deleteOldDailyViews(payload, { now: Date.now(), retentionDays: 90 })).toBe(0)
  })

  it('post o‘chirilsa — ko‘rishlari ham (FK cascade)', async () => {
    const gone = await createPost('gone', true)
    await recordView(payload, gone.id)
    await payload.delete({ collection: 'posts', id: gone.id })
    expect(await daily(gone.id)).toEqual([])
    expect(await loadTotalViews(payload, gone.id)).toBe(0)
  })
})
