import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { makeHookDeps } from '@/collections/Posts/make'
import { DEFAULT_QUEUE, MAKE_WEBHOOK_TASK } from '@/jobs/constants'
import { runWithDeadline } from '@/jobs/context'
import type { Category, Media, Post, Tag } from '@/payload-types'
import { type MakeConfig, makeConfigOverride } from '@/social/make/config'
import {
  findMakeDelivery,
  makeDeliveryKey,
  makeDeps,
  runMakeWebhook,
  sendMakeTest,
} from '@/social/make/deliver'
import type { MakePayload } from '@/social/make/payload'
import { signMakeBody } from '@/social/make/payload'
import { telegramConfigOverride } from '@/telegram/config'

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
 * Make.com avtopost (OBLOG-91) — Postgres (+ MinIO muqova uchun), `fetch` — soxta (Make webhook
 * va Telegram alert). `after()` — `makeHookDeps.runAfter` orqali yig'iladi (`flushAfter`).
 */
const ORIGIN = 'https://blog.odya.uz'
const HOOK = 'https://hook.eu2.make.com/test-hook-abc'
const SECRET = 'make-test-secret-1234567890'
const ALERT_CHAT = '-100777'

const CONFIG: MakeConfig = {
  enabled: true,
  webhookUrl: HOOK,
  urlSource: 'settings',
  secret: SECRET,
  scripts: ['uz-Latn', 'uz-Cyrl'],
  hashtagsCount: 8,
  brandHashtag: '#BlogOdya',
  instagramCta: 'To‘liq maqola — profildagi havolada.',
  instagramImage: 'square',
}

interface Call {
  url: string
  headers: Record<string, string>
  body: string
}

let payload: Payload
let users: TestUsers
let category: Category
let tag: Tag
let cover: Media | null = null
const created: number[] = []
const calls: Call[] = []
/** Make javoblari navbati (bo'sh — 200 "Accepted"). */
const responses: (number | 'network')[] = []
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
  if (next === 'network') throw new TypeError(`fetch failed ${url}`)
  if (next && next !== 200) return new Response('Scenario error', { status: next })
  return new Response('Accepted', { status: 200 })
}

const hookCalls = () => calls.filter((call) => call.url === HOOK)
const alertCalls = () => calls.filter((call) => call.url.startsWith('https://api.telegram.org/'))
const bodyOf = (call: Call) => JSON.parse(call.body) as MakePayload

async function update(id: number, data: Partial<Post>, draft = false) {
  return payload.update({ collection: 'posts', id, data, draft, ...as(users.editor) })
}

async function postInReview(overrides: Partial<Post> = {}): Promise<Post> {
  const post = await payload.create({
    collection: 'posts',
    data: {
      title: 'Yangi model taqdim etildi',
      excerpt: 'Kompaniya yangi sun’iy intellekt modelini e’lon qildi. U ikki baravar tez.',
      slug: testSlug('make'),
      category: category.id,
      tags: [tag.id],
      workflowStatus: 'draft',
      ...overrides,
    },
    ...as(users.editor),
  })
  created.push(post.id)
  await update(post.id, { workflowStatus: 'in_progress' })
  return update(post.id, { workflowStatus: 'review' })
}

const publish = (id: number, data: Partial<Post> = {}) =>
  update(id, { ...data, _status: 'published' })

async function makeJobs(postId: number) {
  const { docs } = await payload.find({
    collection: 'payload-jobs',
    where: {
      and: [{ taskSlug: { equals: MAKE_WEBHOOK_TASK } }, { 'input.postId': { equals: postId } }],
    },
    depth: 0,
    limit: 20,
  })
  return docs
}

const delivery = (postId: number, script: 'uz-Latn' | 'uz-Cyrl' = 'uz-Latn') =>
  findMakeDelivery(payload, makeDeliveryKey(postId, 'post.published', script))

describe('Make avtopost (make.webhook)', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await deleteTestContent(payload)
    await deleteTestUsers(payload)
    await payload.delete({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: MAKE_WEBHOOK_TASK } },
    })
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
    tag = await payload.create({
      collection: 'tags',
      data: { name: "Sun'iy intellekt", slug: testSlug('tag') },
    })
    try {
      const data = await sharp({
        create: { width: 1600, height: 900, channels: 3, background: '#224488' },
      })
        .webp()
        .toBuffer()
      cover = await payload.create({
        collection: 'media',
        data: { alt: 'Muqova', license: 'own' },
        file: { data, mimetype: 'image/webp', name: 'make-muqova.webp', size: data.length },
      })
    } catch (error) {
      console.warn('MinIO yo‘q — muqovasiz davom etiladi', error)
    }
    makeDeps.fetch = fakeFetch
    makeDeps.origin = () => ORIGIN
    makeHookDeps.runAfter = (task) => {
      afterQueue.push(task)
      return true
    }
    // Telegram: token + alert chat (ogohlantirish uchun), kanal yo'q — Telegram avtopost o'tkaziladi.
    telegramConfigOverride.current = {
      token: '123:TEST',
      channels: {},
      disabled: ['uz-Latn', 'uz-Cyrl'],
      template: '{{title}}',
      hashtagsCount: 0,
      alertChatId: ALERT_CHAT,
    }
  })

  beforeEach(() => {
    calls.length = 0
    responses.length = 0
    afterQueue.length = 0
    makeConfigOverride.current = CONFIG
  })

  afterAll(async () => {
    Object.assign(makeDeps, originalDeps)
    makeHookDeps.runAfter = originalRunAfter
    makeConfigOverride.current = undefined
    telegramConfigOverride.current = undefined
    if (payload) {
      await payload.delete({
        collection: 'payload-jobs',
        where: { taskSlug: { equals: MAKE_WEBHOOK_TASK } },
      })
      if (created.length) {
        await payload.delete({
          collection: 'social-deliveries',
          where: { post: { in: created } },
        })
      }
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
      if (cover) await payload.delete({ collection: 'media', id: cover.id }).catch(() => undefined)
    }
    await payload?.db?.destroy?.()
  })

  it('publish → har yozuvga bitta job → webhook (JSON, imzo, sarlavhalar), holat "sent"', async () => {
    const post = await postInReview()
    await publish(post.id)
    expect(await makeJobs(post.id)).toHaveLength(2)
    expect(hookCalls()).toHaveLength(0)
    await flushAfter()

    const sent = hookCalls()
    expect(sent).toHaveLength(2)
    for (const call of sent) {
      expect(call.headers['content-type']).toContain('application/json')
      expect(call.headers['x-odya-event']).toBe('post.published')
      expect(call.headers['x-odya-delivery']).toMatch(/^[0-9a-f-]{36}$/)
      expect(call.headers['x-odya-signature']).toBe(signMakeBody(call.body, SECRET))
    }
    const latn = bodyOf(sent.find((call) => bodyOf(call).script === 'uz-Latn')!)
    const cyrl = bodyOf(sent.find((call) => bodyOf(call).script === 'uz-Cyrl')!)
    expect(latn).toMatchObject({
      event: 'post.published',
      test: false,
      post: {
        id: post.id,
        title: 'Yangi model taqdim etildi',
        url: `${ORIGIN}/${category.slug}/${post.slug}`,
        category: { slug: category.slug, name: 'Test kategoriya' },
      },
      hashtags: ['#SuniyIntellekt', '#TestKategoriya', '#BlogOdya'],
      images: { fromCover: false },
    })
    expect(latn.instagram.caption).toBe(
      'Yangi model taqdim etildi\n\nKompaniya yangi sun’iy intellekt modelini e’lon qildi. U ikki baravar tez.\n\nTo‘liq maqola — profildagi havolada.\n\n#SuniyIntellekt #TestKategoriya #BlogOdya',
    )
    expect(latn.instagram.imageUrl).toMatch(
      new RegExp(`^${ORIGIN}/og/latn/social/${post.id}/square\\.jpg\\?v=\\d+$`),
    )
    // Kirill: kirill matn, /kr havola, CTA kirillda, heshteglar lotinda.
    expect(cyrl.post.title).toMatch(/^Янги модел/)
    expect(cyrl.post.url).toBe(`${ORIGIN}/kr/${category.slug}/${post.slug}`)
    expect(cyrl.instagram.caption).toContain('Тўлиқ мақола')
    expect(cyrl.hashtags).toEqual(latn.hashtags)
    expect(cyrl.instagram.imageUrl).toContain('/og/cyrl/social/')

    const row = await delivery(post.id)
    expect(row).toMatchObject({ status: 'sent', httpStatus: 200, attempts: 1, error: null })
    expect(row!.deliveryId).toBe(latn.deliveryId)
    expect(await makeJobs(post.id)).toHaveLength(0)
  })

  it('idempotent: qayta saqlash, qoralama va qayta publish — yangi so‘rov yo‘q', async () => {
    makeConfigOverride.current = { ...CONFIG, scripts: ['uz-Latn'] }
    const post = await postInReview()
    await publish(post.id)
    await flushAfter()
    expect(hookCalls()).toHaveLength(1)
    calls.length = 0

    await publish(post.id, { title: 'Yangilangan sarlavha' })
    await flushAfter()
    // Qoralama (autosave) va uni chop etish.
    await update(post.id, { title: 'Qoralama' }, true)
    await flushAfter()
    await publish(post.id)
    await flushAfter()
    expect(hookCalls()).toHaveLength(0)
    expect(await makeJobs(post.id)).toHaveLength(0)

    // Job qo'lda ishga tushsa ham — dublikat emas.
    await expect(
      runMakeWebhook(payload, { postId: post.id, script: 'uz-Latn' }),
    ).resolves.toMatchObject({ status: 'duplicate' })
    expect(hookCalls()).toHaveLength(0)
  })

  it('o‘chiq yoki URL yo‘q yoki socialSkip — job qo‘yilmaydi', async () => {
    makeConfigOverride.current = { ...CONFIG, enabled: false }
    const off = await postInReview()
    await publish(off.id)
    makeConfigOverride.current = { ...CONFIG, webhookUrl: undefined }
    const noUrl = await postInReview()
    await publish(noUrl.id)
    makeConfigOverride.current = CONFIG
    const skipped = await postInReview({ socialSkip: true })
    await publish(skipped.id)
    await flushAfter()
    for (const post of [off, noUrl, skipped]) expect(await makeJobs(post.id)).toHaveLength(0)
    expect(hookCalls()).toHaveLength(0)
  })

  it('503 → retry (waitUntil, holat "retry"), keyingi tsiklda — yuboriladi, delivery ID o‘zgarmaydi', async () => {
    makeConfigOverride.current = { ...CONFIG, scripts: ['uz-Latn'] }
    const post = await postInReview()
    responses.push(503)
    const before = Date.now()
    await publish(post.id)
    await flushAfter()

    const jobs = await makeJobs(post.id)
    expect(jobs).toHaveLength(1)
    expect((jobs[0]!.input as { attempt?: number }).attempt).toBe(1)
    expect(new Date(jobs[0]!.waitUntil!).getTime()).toBeGreaterThanOrEqual(before + 59_000)
    const retry = await delivery(post.id)
    expect(retry).toMatchObject({ status: 'retry', httpStatus: 503, attempts: 1 })
    expect(alertCalls()).toHaveLength(0)

    await payload.update({
      collection: 'payload-jobs',
      id: jobs[0]!.id,
      data: { waitUntil: new Date(Date.now() - 1000).toISOString() },
    })
    await runWithDeadline({ taskDeadlineAt: Date.now() + 30_000 }, () =>
      payload.jobs.run({
        queue: DEFAULT_QUEUE,
        where: { taskSlug: { equals: MAKE_WEBHOOK_TASK } },
      }),
    )
    const [first, second] = hookCalls()
    expect(second!.headers['x-odya-delivery']).toBe(first!.headers['x-odya-delivery'])
    expect(await delivery(post.id)).toMatchObject({ status: 'sent', attempts: 2, error: null })
  })

  it('oxirgi urinish (tarmoq xatosi) va 410 — "failed" + Telegram ogohlantirishi', async () => {
    makeConfigOverride.current = { ...CONFIG, scripts: ['uz-Latn'] }
    const post = await postInReview({ socialSkip: true })
    await publish(post.id)
    await update(post.id, { socialSkip: false })
    responses.push('network')
    const out = await runMakeWebhook(payload, { postId: post.id, script: 'uz-Latn', attempt: 3 })
    expect(out).toMatchObject({ status: 'failed', reason: 'Make: tarmoq xatosi' })
    expect(await delivery(post.id)).toMatchObject({ status: 'failed', attempts: 4 })
    const [alert] = alertCalls()
    expect(JSON.parse(alert!.body)).toMatchObject({ chat_id: ALERT_CHAT })
    expect(JSON.parse(alert!.body).text).toContain('Make avtopost')
    // URL (sir) xabarga tushmaydi.
    expect(alert!.body).not.toContain('test-hook-abc')

    calls.length = 0
    responses.push(410)
    const gone = await runMakeWebhook(payload, { postId: post.id, script: 'uz-Latn' })
    expect(gone).toMatchObject({ status: 'failed', httpStatus: 410 })
    expect(await makeJobs(post.id)).toHaveLength(0)
    expect(alertCalls()).toHaveLength(1)
  })

  it('sinov yuborish: test=true, holat yozilmaydi, o‘chiq bo‘lsa ham ishlaydi', async () => {
    makeConfigOverride.current = { ...CONFIG, enabled: false }
    const post = await postInReview()
    await publish(post.id)
    const result = await sendMakeTest(payload, { postId: post.id, script: 'uz-Cyrl' })
    expect(result).toMatchObject({ ok: true, httpStatus: 200 })
    const [call] = hookCalls()
    expect(bodyOf(call!)).toMatchObject({ test: true, script: 'uz-Cyrl' })
    expect(await delivery(post.id, 'uz-Cyrl')).toBeNull()

    const draft = await postInReview()
    await expect(
      sendMakeTest(payload, { postId: draft.id, script: 'uz-Latn' }),
    ).resolves.toMatchObject({ ok: false })
  })

  it('JPEG route: muqova bo‘yicha kesilgan JPEG (1080×1350), qoralama — 404', async () => {
    if (!cover) return
    const { GET } = await import('@/app/(seo)/og/[script]/social/[id]/[file]/route')
    makeConfigOverride.current = { ...CONFIG, enabled: false }
    const post = await postInReview({ coverImage: cover.id })
    const draftResponse = await GET(new Request('http://x'), {
      params: Promise.resolve({ script: 'latn', id: String(post.id), file: 'square.jpg' }),
    })
    expect(draftResponse.status).toBe(404)

    await publish(post.id)
    const response = await GET(new Request('http://x'), {
      params: Promise.resolve({ script: 'latn', id: String(post.id), file: 'portrait.jpg' }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('x-odya-image-source')).toBe('cover')
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
    expect(meta).toMatchObject({ format: 'jpeg', width: 1080, height: 1350 })

    const bad = await GET(new Request('http://x'), {
      params: Promise.resolve({ script: 'latn', id: String(post.id), file: 'square.webp' }),
    })
    expect(bad.status).toBe(404)
  })

  it('JPEG route: muqovasiz — brend kartochkasi (1080×1080, kirill)', async () => {
    const { GET } = await import('@/app/(seo)/og/[script]/social/[id]/[file]/route')
    makeConfigOverride.current = { ...CONFIG, enabled: false }
    const post = await postInReview()
    await publish(post.id)
    const response = await GET(new Request('http://x'), {
      params: Promise.resolve({ script: 'cyrl', id: String(post.id), file: 'square.jpg' }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-odya-image-source')).toBe('card')
    expect(response.headers.get('cache-control')).toContain('s-maxage=86400')
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
    expect(meta).toMatchObject({ format: 'jpeg', width: 1080, height: 1080 })
  })
})
