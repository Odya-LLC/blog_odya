import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runCleanup } from '@/jobs/tasks/maintenanceCleanup'
import { handleViewRequest, type ViewOutcome } from '@/pageviews/handler'
import { deleteExpiredViewLimits, loadTotalViews, recordView } from '@/pageviews/store'
import type { Category, Post } from '@/payload-types'
import { setRevalidator } from '@/site/revalidate'

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
 * OBLOG-71 Postgres bilan: cookie'siz skript `/api/views` ni "puflay" olmaydi — IP + UA + post
 * 30 daqiqada bir marta, IP + post va IP bo'yicha soatlik/sutkalik limitlar, boshqa IP'larga
 * ta'sir yo'q, javob doim 204; muddati o'tgan qatorlar tozalanadi. Vaqt — `deps.now` orqali.
 */

let payload: Payload
let users: TestUsers
let category: Category
const posts: Post[] = []
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const SECRET = 'oblog-71-test-secret-'.padEnd(40, 'x')
const LIMITS = { perHour: 6, perDay: 10, perPostHour: 5 }
const MINUTE = 60_000
const HOUR = 60 * MINUTE
/** Joriy soat boshi + 1 daqiqa: +59 daqiqagacha shu soat ichida qoladi. */
const T0 = Math.floor(Date.now() / HOUR) * HOUR + MINUTE

function db() {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

async function limitRows(): Promise<number> {
  const result = (await db().execute(
    sql`SELECT count(*)::int AS "n" FROM "post_view_limits"`,
  )) as unknown as { rows: Array<{ n: number }> }
  return Number(result.rows[0]?.n ?? 0)
}

async function createPublished(name: string): Promise<Post> {
  const editor = as(users.editor)
  const post = await payload.create({
    collection: 'posts',
    data: {
      title: `IP limit testi ${name}`,
      slug: testSlug(`pvrl-${name}`),
      category: category.id,
      workflowStatus: 'draft',
    },
    ...editor,
  })
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

/** Cookie'siz beacon (skript kabi). */
async function beacon(
  postId: number,
  options: { ip?: string; ua?: string; at?: number } = {},
): Promise<ViewOutcome> {
  const headers: Record<string, string> = {
    'user-agent': options.ua ?? CHROME,
    'sec-fetch-site': 'same-origin',
  }
  if (options.ip) headers['x-forwarded-for'] = `${options.ip}, 10.0.0.1`
  const { response, outcome } = await handleViewRequest(
    new Request('http://localhost:3100/api/views', {
      method: 'POST',
      body: String(postId),
      headers,
    }),
    {
      record: (id, guard) => recordView(payload, id, { guard }),
      rateLimit: { secret: SECRET, limits: LIMITS },
      now: () => options.at ?? T0,
      random: () => 1,
    },
  )
  expect(response.status).toBe(204)
  return outcome
}

describe('ko‘rishlar: IP bo‘yicha himoya (Postgres)', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    setRevalidator(() => {})
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
    for (let i = 0; i < 10; i++) posts.push(await createPublished(`p${i}`))
  })

  afterAll(async () => {
    setRevalidator(null)
    if (payload) {
      await deleteExpiredViewLimits(payload, { now: new Date(T0 + 3 * 24 * HOUR) })
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
      await payload.db?.destroy?.()
    }
  })

  it('bir xil IP + UA + post — 30 daqiqada bir marta; boshqa UA / boshqa IP — hisoblanadi', async () => {
    const post = posts[0]!
    const ip = '198.51.100.10'
    expect(await beacon(post.id, { ip })).toBe('counted')
    expect(await beacon(post.id, { ip })).toBe('duplicate')
    expect(await beacon(post.id, { ip, at: T0 + 29 * MINUTE })).toBe('duplicate')
    expect(await loadTotalViews(payload, post.id)).toBe(1)

    // NAT ortidagi boshqa brauzer — sanaladi.
    expect(await beacon(post.id, { ip, ua: `${CHROME} Edg/140.0` })).toBe('counted')
    // Boshqa IP — ta'sir yo'q.
    expect(await beacon(post.id, { ip: '198.51.100.11' })).toBe('counted')
    // 30 daqiqadan keyin — yana hisoblanadi.
    expect(await beacon(post.id, { ip, at: T0 + 31 * MINUTE })).toBe('counted')
    expect(await loadTotalViews(payload, post.id)).toBe(4)
  })

  it('UA aylantirib bitta postni puflash — IP + post soatlik limitida to‘xtaydi', async () => {
    const post = posts[1]!
    const ip = '198.51.100.20'
    const outcomes: ViewOutcome[] = []
    for (let i = 0; i < 6; i++) outcomes.push(await beacon(post.id, { ip, ua: `${CHROME} r${i}` }))
    // 6-urinish: IP + post (5) limiti (IP soatlik — 6, hali yetmagan).
    expect(outcomes).toEqual(['counted', 'counted', 'counted', 'counted', 'counted', 'limited'])
    expect(await loadTotalViews(payload, post.id)).toBe(5)
    // Boshqa IP'ga ta'sir yo'q; keyingi soatda shu IP yana hisoblatadi.
    expect(await beacon(post.id, { ip: '198.51.100.21' })).toBe('counted')
    expect(await beacon(post.id, { ip, ua: `${CHROME} next`, at: T0 + HOUR })).toBe('counted')
    expect(await loadTotalViews(payload, post.id)).toBe(7)
  })

  it('post ID’larini aylantirish — IP soatlik va sutkalik limitida to‘xtaydi', async () => {
    const ip = '2001:db8:71:1::1'
    const outcomes: ViewOutcome[] = []
    for (const post of posts.slice(2, 10)) outcomes.push(await beacon(post.id, { ip }))
    // perHour = 6: 7- va 8-urinish hisoblanmaydi.
    expect(outcomes.filter((outcome) => outcome === 'counted')).toHaveLength(6)
    expect(outcomes.slice(6)).toEqual(['limited', 'limited'])
    // Shu /64 dagi boshqa manzil — o'sha chelak (IPv6 aylantirish yordam bermaydi).
    expect(await beacon(posts[2]!.id, { ip: '2001:db8:71:1::beef', ua: 'x Chrome/1' })).toBe(
      'limited',
    )
    // Boshqa /64 — ta'sir yo'q.
    expect(await beacon(posts[2]!.id, { ip: '2001:db8:71:2::1' })).toBe('counted')

    // Keyingi soat: soatlik limit yangilanadi, lekin sutkalik (10) da 9 urinish bor — 1 tasi o'tadi.
    const nextHour: ViewOutcome[] = []
    for (const [i, post] of posts.slice(2, 6).entries()) {
      nextHour.push(await beacon(post.id, { ip, ua: `${CHROME} h${i}`, at: T0 + HOUR }))
    }
    // Sutka (Toshkent) almashgan bo'lsa (T0 18:xx UTC) — barcha kalitlar yangi.
    const dayRolled = new Date(T0 + HOUR).getUTCHours() === 19
    expect(nextHour.filter((outcome) => outcome === 'counted')).toHaveLength(dayRolled ? 4 : 1)
  })

  it('noma’lum / chop etilmagan post — limit qatori ham yozilmaydi', async () => {
    const before = await limitRows()
    expect(await beacon(2_000_000_000, { ip: '198.51.100.30' })).toBe('unknown')
    expect(await limitRows()).toBe(before)
  })

  it('IP yo‘q — faqat cookie dedupe (guard’siz), limit jadvaliga tegilmaydi', async () => {
    const post = posts[0]!
    const before = await limitRows()
    const total = await loadTotalViews(payload, post.id)
    expect(await beacon(post.id)).toBe('counted')
    expect(await beacon(post.id)).toBe('counted')
    expect(await loadTotalViews(payload, post.id)).toBe(total + 2)
    expect(await limitRows()).toBe(before)
  })

  it('tozalash: muddati o‘tgan qatorlar o‘chadi (partiya va maintenance.cleanup)', async () => {
    const before = await limitRows()
    expect(before).toBeGreaterThan(5)
    // Hali hech biri muddati o'tmagan (T0 dan 30 daqiqa oldin).
    expect(await deleteExpiredViewLimits(payload, { now: new Date(T0 - 30 * MINUTE) })).toBe(0)
    // Partiya: ko'pi bilan `limit` ta.
    const later = new Date(T0 + 3 * 24 * HOUR)
    expect(await deleteExpiredViewLimits(payload, { now: later, limit: 2 })).toBe(2)
    expect(await limitRows()).toBe(before - 2)

    // maintenance.cleanup: real vaqt bo'yicha muddati o'tganlar (qo'lda kiritilgan eski qator).
    await db().execute(sql`
      INSERT INTO "post_view_limits" ("key", "hits", "expires_at")
      VALUES (decode(md5('oblog-71-expired'), 'hex'), 1, now() - interval '1 hour')
    `)
    const output = await runCleanup(payload, { now: () => Date.now(), lister: null })
    expect(output.deletedViewLimits).toBeGreaterThanOrEqual(1)
    const left = (await db().execute(
      sql`SELECT count(*)::int AS "n" FROM "post_view_limits" WHERE "expires_at" <= now()`,
    )) as unknown as { rows: Array<{ n: number }> }
    expect(Number(left.rows[0]?.n)).toBe(0)
  })
})
