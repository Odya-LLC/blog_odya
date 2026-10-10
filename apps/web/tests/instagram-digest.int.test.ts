import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { makeHookDeps } from '@/collections/Posts/make'
import { MAKE_WEBHOOK_TASK } from '@/jobs/constants'
import { handleJobsRunRequest, type JobsRunResponse } from '@/jobs/runner'
import type { Category, InstagramDigest, Post, Tag } from '@/payload-types'
import { type MakeConfig, makeConfigOverride } from '@/social/make/config'
import { findMakeDelivery, makeDeliveryKey, makeDeps, sendMakeTest } from '@/social/make/deliver'
import type { MakePayload } from '@/social/make/payload'
import { instagramDigestKey, runInstagramDigests, sendDigestTest } from '@/social/instagram/digest'
import type { MakeDigestPayload } from '@/social/instagram/digestPayload'
import { resolveDigestSettings, telegramConfigOverride } from '@/telegram/config'

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
 * Instagram story + dayjest karuseli (OBLOG-118) — Postgres, `fetch` — soxta (Make webhook).
 * Vaqt — kelajakdagi slotlar (2031 yil, Toshkent), shunda boshqa testlarning postlari oynaga
 * tushmaydi.
 */
const ORIGIN = 'https://blog.odya.uz'
const HOOK = 'https://hook.eu2.make.com/ig-digest-test'
const SECRET = 'ig-digest-jobs-secret-0123456789abcdef'

const CONFIG: MakeConfig = {
  enabled: true,
  webhookUrl: HOOK,
  urlSource: 'settings',
  secret: 'make-secret',
  scripts: ['uz-Latn'],
  hashtagsCount: 5,
  brandHashtag: '#BlogOdya',
  instagramCta: 'To‘liq maqola — profildagi havolada.',
  instagramImage: 'portrait',
  imageOverlay: true,
  imageScheme: 'dark',
  instagramMode: 'story+digest',
  instagramStories: false,
  instagramDigestTimes: [450, 750, 1110],
  instagramDailyLimit: 50,
}

/** Toshkent vaqti → epoch ms. */
const at = (local: string) => Date.parse(`${local}+05:00`)
const iso = (local: string) => new Date(at(local)).toISOString()

interface Call {
  url: string
  headers: Record<string, string>
  body: string
}

let payload: Payload
let users: TestUsers
let category: Category
let tag: Tag
const calls: Call[] = []
const responses: number[] = []
const originalDeps = { ...makeDeps }
const originalRunAfter = makeHookDeps.runAfter
const afterQueue: (() => Promise<void>)[] = []

async function flushAfter() {
  while (afterQueue.length) await afterQueue.shift()!()
}

const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input)
  const headers = Object.fromEntries(new Headers(init?.headers).entries())
  calls.push({ url, headers, body: String(init?.body ?? '') })
  if (url.startsWith('https://api.telegram.org/')) {
    return Response.json({ ok: true, result: { message_id: 1 } })
  }
  const next = responses.shift()
  if (next && next !== 200) return new Response('Scenario error', { status: next })
  return new Response('Accepted', { status: 200 })
}

const hookCalls = () => calls.filter((call) => call.url === HOOK)
const alertCalls = () => calls.filter((call) => call.url.startsWith('https://api.telegram.org/'))
const bodyOf = <T = MakePayload>(call: Call) => JSON.parse(call.body) as T

async function update(id: number, data: Partial<Post>) {
  return payload.update({ collection: 'posts', id, data, ...as(users.editor) })
}

/** Chop etilgan post: `publishedAt` — berilgan Toshkent vaqti. */
async function publishedPost(local: string, overrides: Partial<Post> = {}): Promise<Post> {
  const post = await payload.create({
    collection: 'posts',
    data: {
      title: `Yangilik ${local}`,
      excerpt: 'Qisqa lid.',
      slug: testSlug('ig'),
      category: category.id,
      tags: [tag.id],
      workflowStatus: 'draft',
      ...overrides,
    },
    ...as(users.editor),
  })
  await update(post.id, { workflowStatus: 'in_progress' })
  await update(post.id, { workflowStatus: 'review' })
  return update(post.id, { _status: 'published', publishedAt: iso(local) })
}

async function digestRow(local: string) {
  const { docs } = await payload.find({
    collection: 'instagram-digests',
    where: { key: { equals: instagramDigestKey(at(local)) } },
    depth: 0,
    limit: 1,
  })
  return docs[0] as InstagramDigest | undefined
}

const ids = (values: InstagramDigest['posts']) =>
  (values ?? []).map((value) => (typeof value === 'object' ? value.id : value))

const run = (local: string) => runInstagramDigests(payload, { now: at(local) })

async function clearJobs() {
  await payload.delete({
    collection: 'payload-jobs',
    where: { taskSlug: { equals: MAKE_WEBHOOK_TASK } },
  })
}

describe('Instagram story + dayjest (OBLOG-118)', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await deleteTestContent(payload)
    await deleteTestUsers(payload)
    users = await createTestUsers(payload)
    makeDeps.fetch = fakeFetch
    makeDeps.origin = () => ORIGIN
    makeHookDeps.runAfter = (task) => {
      afterQueue.push(task)
      return true
    }
    // Telegram: `post` rejimi, kanal yo'q (dayjest/avtopost o'tkaziladi), alert chat — bor.
    telegramConfigOverride.current = {
      token: '123:TEST',
      channels: {},
      disabled: ['uz-Latn', 'uz-Cyrl'],
      template: '{{title}}',
      hashtagsCount: 0,
      mode: 'post',
      digest: resolveDigestSettings(null),
      alertChatId: '-100777',
    }
  })

  beforeEach(async () => {
    calls.length = 0
    responses.length = 0
    afterQueue.length = 0
    makeDeps.now = originalDeps.now
    makeConfigOverride.current = CONFIG
    await payload.delete({ collection: 'instagram-digests', where: { id: { exists: true } } })
    await clearJobs()
    // Oldingi testlarning postlari keyingi slotlar oynasiga tushmasin.
    await deleteTestContent(payload)
    category = await createTestCategory(payload)
    tag = await payload.create({
      collection: 'tags',
      data: { name: "Sun'iy intellekt", slug: testSlug('tag') },
    })
  })

  afterAll(async () => {
    Object.assign(makeDeps, originalDeps)
    makeHookDeps.runAfter = originalRunAfter
    makeConfigOverride.current = undefined
    telegramConfigOverride.current = undefined
    if (payload) {
      await payload.delete({ collection: 'instagram-digests', where: { id: { exists: true } } })
      await clearJobs()
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
    }
    await payload?.db?.destroy?.()
  })

  it('story+digest: chop etish → `story` hodisasi (photo post yo‘q), holat post.story', async () => {
    makeConfigOverride.current = { ...CONFIG, instagramStories: true }
    const post = await publishedPost('2031-01-10T09:00:00')
    await flushAfter()
    const sent = hookCalls()
    expect(sent).toHaveLength(1)
    expect(sent[0]!.headers['x-odya-event']).toBe('post.story')
    const body = bodyOf(sent[0]!)
    expect(body).toMatchObject({ type: 'story', event: 'post.story', test: false })
    expect(body.story!.imageUrl).toMatch(
      new RegExp(`^${ORIGIN}/og/latn/social/${post.id}/story\\.jpg\\?v=[0-9a-f]{12}$`),
    )
    expect(body.story).toMatchObject({ width: 1080, height: 1920 })
    const story = await findMakeDelivery(payload, makeDeliveryKey(post.id, 'post.story', 'uz-Latn'))
    expect(story).toMatchObject({ status: 'sent', event: 'post.story' })
    expect(
      await findMakeDelivery(payload, makeDeliveryKey(post.id, 'post.published', 'uz-Latn')),
    ).toBeNull()
  })

  it('story o‘chiq — chop etishda hech narsa yuborilmaydi; post rejimi — dayjest yo‘q', async () => {
    await publishedPost('2031-01-11T09:00:00')
    await flushAfter()
    expect(hookCalls()).toHaveLength(0)

    makeConfigOverride.current = { ...CONFIG, instagramMode: 'post' }
    await expect(run('2031-01-11T12:31:00')).resolves.toEqual({
      mode: 'post',
      slotAt: null,
      status: 'off',
    })
    expect(hookCalls()).toHaveLength(0)
  })

  it('slot tick → bitta `digest` hodisasi: muqova + ≤ 9 post, tartib; takroriy va parallel — dublikat yo‘q', async () => {
    // 12:30 slotining oynasi — 07:30 dan (birinchi dayjest). 07:00 dagi — oynadan tashqarida.
    const outside = await publishedPost('2031-01-12T07:00:00')
    const posts: Post[] = []
    for (let i = 0; i < 10; i++) {
      const minute = String(10 + i * 5).padStart(2, '0')
      posts.push(await publishedPost(`2031-01-12T09:${minute}:00`))
    }
    const important = await publishedPost('2031-01-12T08:00:00', {
      title: 'Kun yangiligi',
      digestPriority: 3,
    })
    expect(hookCalls()).toHaveLength(0)

    // 12:29 — hali 07:30 sloti (kechikkan > 60 daqiqa): hech narsa.
    expect((await run('2031-01-12T12:29:00')).slotAt).toBeNull()

    const results = await Promise.all([
      run('2031-01-12T12:31:00'),
      run('2031-01-12T12:31:00'),
      run('2031-01-12T12:35:00'),
    ])
    expect(results.map((r) => r.status).sort()).toEqual(['busy', 'busy', 'sent'])
    const sent = hookCalls()
    expect(sent).toHaveLength(1)
    expect(sent[0]!.headers['x-odya-event']).toBe('digest.published')
    const body = bodyOf<MakeDigestPayload>(sent[0]!)
    expect(body).toMatchObject({ type: 'digest', test: false, script: 'uz-Latn' })
    expect(body.slides).toHaveLength(10)
    expect(body.slides[0]!.postId).toBeNull()
    expect(body.slides[0]!.imageUrl).toMatch(/\/og\/latn\/digest\/cover\.jpg\?at=\d+&p=/)
    // Tartib: muhimlik, keyin yangisi; 9 dan ortig'i — sig'magan.
    const newest = [...posts].reverse().map((post) => post.id)
    expect(body.slides.slice(1).map((slide) => slide.postId)).toEqual([
      important.id,
      ...newest.slice(0, 8),
    ])
    expect(body.slides[1]!.imageUrl).toMatch(
      new RegExp(`/og/latn/social/${important.id}/portrait\\.jpg\\?v=`),
    )
    expect(body.caption.startsWith('Kun yangiliklari · 12-yanvar\n\n1. Kun yangiligi\n2. ')).toBe(
      true,
    )
    expect(body.caption).toContain('Havola profilda.')
    expect(body.caption).toContain('#SuniyIntellekt')

    const row = (await digestRow('2031-01-12T12:30:00'))!
    expect(row).toMatchObject({ status: 'sent', format: 'carousel', attempts: 1, httpStatus: 200 })
    expect(ids(row.posts)).toEqual(body.slides.slice(1).map((slide) => slide.postId))
    expect(ids(row.skippedPosts)).toEqual(newest.slice(8))
    expect(ids(row.posts)).not.toContain(outside.id)
    expect(row.coverUrl).toBe(body.slides[0]!.imageUrl)

    // Muqova slaydi — ommaviy JPEG (imzo bilan), soxta imzo — 404.
    const { GET } = await import('@/app/(seo)/og/[script]/digest/[file]/route')
    const cover = await GET(new Request(body.slides[0]!.imageUrl), {
      params: Promise.resolve({ script: 'latn', file: 'cover.jpg' }),
    })
    expect(cover.status).toBe(200)
    expect(cover.headers.get('content-type')).toBe('image/jpeg')
    expect(cover.headers.get('cache-control')).toContain('s-maxage=86400')
    expect(await sharp(Buffer.from(await cover.arrayBuffer())).metadata()).toMatchObject({
      format: 'jpeg',
      width: 1080,
      height: 1350,
    })
    const forged = new URL(body.slides[0]!.imageUrl)
    forged.searchParams.set('s', '0000000000000000')
    const bad = await GET(new Request(forged), {
      params: Promise.resolve({ script: 'latn', file: 'cover.jpg' }),
    })
    expect(bad.status).toBe(404)

    // Takroriy tick (shu slot) — yuborilmaydi; keyingi slotda bu postlar (va sig'maganlar) yo'q.
    calls.length = 0
    expect((await run('2031-01-12T12:45:00')).status).toBe('busy')
    const next = await run('2031-01-12T18:31:00')
    expect(next.status).toBe('empty')
    expect(hookCalls()).toHaveLength(0)
  })

  it('post ikki dayjestga tushmaydi (oyna orqaga surilsa ham)', async () => {
    const a = await publishedPost('2031-01-13T08:00:00')
    const b = await publishedPost('2031-01-13T09:00:00')
    await run('2031-01-13T12:30:00')
    const first = (await digestRow('2031-01-13T12:30:00'))!
    expect(ids(first.posts).sort()).toEqual([a.id, b.id].sort())
    // Oldingi dayjest slotini orqaga suramiz — oyna eski postlarni ham qamraydi.
    await payload.update({
      collection: 'instagram-digests',
      id: first.id,
      data: { slotAt: iso('2031-01-13T07:30:00') },
    })
    const c = await publishedPost('2031-01-13T13:00:00')
    const d = await publishedPost('2031-01-13T14:00:00')
    calls.length = 0
    await run('2031-01-13T18:30:00')
    const second = (await digestRow('2031-01-13T18:30:00'))!
    expect(ids(second.posts).sort()).toEqual([c.id, d.id].sort())
    expect(bodyOf<MakeDigestPayload>(hookCalls()[0]!).slides).toHaveLength(3)
  })

  it('1 post — odatdagi rasmli post (`post.published`); 0 post — hech narsa', async () => {
    const empty = await run('2031-01-14T07:31:00')
    expect(empty).toMatchObject({ status: 'empty', slotAt: iso('2031-01-14T07:30:00') })
    expect(hookCalls()).toHaveLength(0)
    expect((await digestRow('2031-01-14T07:30:00'))!.status).toBe('empty')

    const post = await publishedPost('2031-01-14T10:00:00', { title: 'Yagona yangilik' })
    const result = await run('2031-01-14T12:32:00')
    expect(result).toMatchObject({ status: 'single', posts: 1 })
    const [call] = hookCalls()
    expect(call!.headers['x-odya-event']).toBe('post.published')
    expect(bodyOf(call!)).toMatchObject({ type: 'post', post: { id: post.id } })
    const row = (await digestRow('2031-01-14T12:30:00'))!
    expect(row).toMatchObject({ status: 'sent', format: 'single' })
    expect(ids(row.posts)).toEqual([post.id])
    expect(
      await findMakeDelivery(payload, makeDeliveryKey(post.id, 'post.published', 'uz-Latn')),
    ).toMatchObject({ status: 'sent' })
  })

  it('Make xatosi — `retry`, keyingi tick’da bir marta; 3 urinishdan keyin — `failed` + ogohlantirish', async () => {
    await publishedPost('2031-01-15T09:00:00')
    await publishedPost('2031-01-15T10:00:00')
    responses.push(503)
    expect((await run('2031-01-15T12:30:00')).status).toBe('retry')
    const retry = (await digestRow('2031-01-15T12:30:00'))!
    expect(retry).toMatchObject({ status: 'retry', attempts: 1, httpStatus: 503 })
    expect(ids(retry.posts)).toEqual([])
    const firstDelivery = hookCalls()[0]!.headers['x-odya-delivery']

    responses.push(500, 500)
    expect((await run('2031-01-15T12:40:00')).status).toBe('retry')
    expect((await run('2031-01-15T12:50:00')).status).toBe('failed')
    expect(hookCalls()).toHaveLength(3)
    // Qayta urinishlarda X-Odya-Delivery o'zgarmaydi.
    expect(new Set(hookCalls().map((call) => call.headers['x-odya-delivery']))).toEqual(
      new Set([firstDelivery]),
    )
    expect((await digestRow('2031-01-15T12:30:00'))!).toMatchObject({
      status: 'failed',
      attempts: 3,
    })
    expect(alertCalls()).toHaveLength(1)
    expect(alertCalls()[0]!.body).not.toContain('ig-digest-test')
    expect((await run('2031-01-15T13:00:00')).status).toBe('busy')
  })

  it('kunlik limit: chegaraga yaqin — muhim bo‘lmagan story o‘tkaziladi, post dayjestga tushadi', async () => {
    // 24 soatlik oyna faqat shu testning yozuvlarini ko'rsin (sentAt — makeDeps.now).
    makeDeps.now = () => at('2031-01-16T12:00:00')
    // limit 10, 3 slot → story chegarasi 7; muhim bo'lmaganlar — 2 tagacha (7 − 5).
    makeConfigOverride.current = { ...CONFIG, instagramStories: true, instagramDailyLimit: 10 }
    const p1 = await publishedPost('2031-01-16T08:00:00')
    await flushAfter()
    const p2 = await publishedPost('2031-01-16T08:10:00')
    await flushAfter()
    const low = await publishedPost('2031-01-16T08:20:00')
    await flushAfter()
    const high = await publishedPost('2031-01-16T08:30:00', { digestPriority: 2 })
    await flushAfter()
    const storyOf = (post: Post) =>
      findMakeDelivery(payload, makeDeliveryKey(post.id, 'post.story', 'uz-Latn'))
    expect((await storyOf(p1))!.status).toBe('sent')
    expect((await storyOf(p2))!.status).toBe('sent')
    const skipped = (await storyOf(low))!
    expect(skipped.status).toBe('skipped')
    expect(skipped.error).toContain('daily-limit-low-priority')
    expect((await storyOf(high))!.status).toBe('sent')
    expect(hookCalls().map((call) => bodyOf(call).post.id)).toEqual([p1.id, p2.id, high.id])

    // O'tkazilgan story qayta yuborilmaydi ("Make'ga yuborish" ham job qo'ymaydi).
    const { queueMakeDeliveries } = await import('@/collections/Posts/make')
    expect(await queueMakeDeliveries(payload, low.id, makeConfigOverride.current)).toEqual([])

    // Dayjestga hammasi tushadi (story yuborilganlari ham).
    calls.length = 0
    await run('2031-01-16T12:31:00')
    const row = (await digestRow('2031-01-16T12:30:00'))!
    expect(ids(row.posts)).toContain(low.id)
    expect(ids(row.posts)).toHaveLength(4)
  })

  it('sinov: story va digest JSON’i test=true bilan, holat yozilmaydi', async () => {
    makeConfigOverride.current = { ...CONFIG, enabled: false }
    const a = await publishedPost('2031-01-17T09:00:00')
    await publishedPost('2031-01-17T10:00:00')
    const story = await sendMakeTest(payload, {
      postId: a.id,
      script: 'uz-Latn',
      event: 'post.story',
    })
    expect(story).toMatchObject({ ok: true, httpStatus: 200 })
    const digest = await sendDigestTest(payload, { postId: a.id })
    expect(digest).toMatchObject({ ok: true, httpStatus: 200 })
    const [storyCall, digestCall] = hookCalls()
    expect(bodyOf(storyCall!)).toMatchObject({ type: 'story', test: true })
    const body = bodyOf<MakeDigestPayload>(digestCall!)
    expect(body).toMatchObject({ type: 'digest', test: true })
    expect(body.slides[1]!.postId).toBe(a.id)
    expect(body.slides.length).toBeGreaterThanOrEqual(3)
    expect(
      await findMakeDelivery(payload, makeDeliveryKey(a.id, 'post.story', 'uz-Latn')),
    ).toBeNull()
    const { totalDocs } = await payload.count({ collection: 'instagram-digests' })
    expect(totalDocs).toBe(0)
  })

  it('/api/jobs/run?mode=publish — nashr bosqichidan keyin Instagram dayjesti (javobda instagramDigest)', async () => {
    await publishedPost('2031-01-18T15:00:00')
    await publishedPost('2031-01-18T16:00:00')
    const response = await handleJobsRunRequest(
      new Request('http://localhost:3000/api/jobs/run?mode=publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SECRET}` },
      }),
      { getPayload: async () => payload, secret: SECRET, now: () => at('2031-01-18T18:34:00') },
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as JobsRunResponse
    expect(body.instagramDigest).toMatchObject({
      mode: 'story+digest',
      slotAt: iso('2031-01-18T18:30:00'),
      status: 'sent',
      posts: 2,
    })
    expect(hookCalls()).toHaveLength(1)
  })
})
