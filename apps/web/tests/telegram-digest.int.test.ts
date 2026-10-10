import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { telegramHookDeps } from '@/collections/Posts/telegram'
import { DEFAULT_TELEGRAM_TEMPLATE } from '@/globals/TelegramSettings'
import { TELEGRAM_DIGEST_EDIT_TASK, TELEGRAM_POST_TASK } from '@/jobs/constants'
import { handleJobsRunRequest, type JobsRunResponse } from '@/jobs/runner'
import type { Category, Media, Post, Tag, TelegramDigest } from '@/payload-types'
import { readTelegramState, telegramDeps } from '@/telegram/autopost'
import {
  resolveDigestSettings,
  type TelegramConfig,
  telegramConfigOverride,
} from '@/telegram/config'
import { digestKey, runTelegramDigests } from '@/telegram/digest'

import {
  as,
  createTestCategory,
  createTestUsers,
  deleteTestContent,
  testSlug,
  type TestUsers,
} from './helpers/content'
import { deleteTestUsers, initTestPayload } from './helpers/payload'
import { FakeTelegram } from './helpers/telegram'

/**
 * Telegram dayjesti (OBLOG-116) — Postgres (+ MinIO muqova uchun) va soxta Bot API. Vaqt —
 * kelajakdagi slotlar (2030 yil, Toshkent), shunda boshqa testlarning postlari oynaga tushmaydi.
 */
const TOKEN = '123456:TEST-token'
const ORIGIN = 'https://blog.odya.uz'
const LATN = '@odya_latn_digest'
const CYRL = '@odya_cyrl_digest'
const SECRET = 'digest-test-secret-0123456789abcdef'

const CONFIG: TelegramConfig = {
  token: TOKEN,
  channels: {
    'uz-Latn': { script: 'uz-Latn', chatId: LATN, source: 'settings' },
    'uz-Cyrl': { script: 'uz-Cyrl', chatId: CYRL, source: 'settings' },
  },
  disabled: [],
  template: DEFAULT_TELEGRAM_TEMPLATE,
  hashtagsCount: 3,
  alertChatId: '-100999',
  mode: 'digest',
  digest: resolveDigestSettings(null),
}

/** Toshkent vaqti → epoch ms. */
const at = (local: string) => Date.parse(`${local}+05:00`)
const iso = (local: string) => new Date(at(local)).toISOString()

let payload: Payload
let users: TestUsers
let category: Category
let tag: Tag
let cover: Media | null = null
const fake = new FakeTelegram()
const originalDeps = { ...telegramDeps }
const originalRunAfter = telegramHookDeps.runAfter
const afterQueue: (() => Promise<void>)[] = []

async function flushAfter() {
  while (afterQueue.length) await afterQueue.shift()!()
}

async function update(id: number, data: Partial<Post>, draft = false) {
  return payload.update({ collection: 'posts', id, data, draft, ...as(users.editor) })
}

/** Chop etilgan post: `publishedAt` — berilgan Toshkent vaqti. */
async function publishedPost(local: string, overrides: Partial<Post> = {}): Promise<Post> {
  const post = await payload.create({
    collection: 'posts',
    data: {
      title: `Yangilik ${local}`,
      excerpt: 'Qisqa lid.',
      slug: testSlug('dg'),
      category: category.id,
      tags: [tag.id],
      workflowStatus: 'draft',
      ...(cover ? { coverImage: cover.id } : {}),
      ...overrides,
    },
    ...as(users.editor),
  })
  await update(post.id, { workflowStatus: 'in_progress' })
  await update(post.id, { workflowStatus: 'review' })
  return update(post.id, { _status: 'published', publishedAt: iso(local) })
}

async function jobsOf(task: string) {
  const { docs } = await payload.find({
    collection: 'payload-jobs',
    where: { taskSlug: { equals: task } },
    depth: 0,
    limit: 50,
  })
  return docs
}

async function digestRow(script: 'uz-Latn' | 'uz-Cyrl', local: string) {
  const { docs } = await payload.find({
    collection: 'telegram-digests',
    where: { key: { equals: digestKey(script, at(local)) } },
    depth: 0,
    limit: 1,
  })
  return docs[0] as TelegramDigest | undefined
}

const ids = (values: TelegramDigest['posts']) =>
  (values ?? []).map((value) => (typeof value === 'object' ? value.id : value))

/** Kanalga yuborilgan yangi xabarlar (ogohlantirish chatisiz). */
const channelSends = (chatId: string) =>
  fake.calls.filter(
    (call) =>
      ['sendMediaGroup', 'sendPhoto', 'sendMessage'].includes(call.method) &&
      call.body.chat_id === chatId,
  )

/** Galereya (muqova bor) — birinchi rasm caption'i; muqovasiz — matnli xabar. */
function digestCaption(chatId: string): string {
  const [call] = channelSends(chatId)
  if (!call) return ''
  if (call.method === 'sendMediaGroup') {
    return String((call.body.media as { caption?: string }[])[0]?.caption ?? '')
  }
  return String(call.body.caption ?? call.body.text ?? '')
}

const run = (local: string) => runTelegramDigests(payload, { now: at(local) })

describe('Telegram dayjesti (OBLOG-116)', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await deleteTestContent(payload)
    await deleteTestUsers(payload)
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
    tag = await payload.create({
      collection: 'tags',
      data: { name: "Sun'iy intellekt", slug: testSlug('tag') },
    })
    try {
      const data = await sharp({
        create: { width: 1200, height: 800, channels: 3, background: '#335577' },
      })
        .jpeg()
        .toBuffer()
      cover = await payload.create({
        collection: 'media',
        data: { alt: 'Muqova', license: 'own' },
        file: { data, mimetype: 'image/jpeg', name: 'dg-muqova.jpg', size: data.length },
      })
    } catch (error) {
      console.warn('MinIO yo‘q — muqovasiz (matnli dayjest) davom etiladi', error)
    }
    telegramDeps.createApi = fake.api
    telegramDeps.origin = () => ORIGIN
    telegramDeps.sleep = async () => {}
    telegramHookDeps.runAfter = (task) => {
      afterQueue.push(task)
      return true
    }
  })

  beforeEach(async () => {
    fake.reset()
    afterQueue.length = 0
    telegramConfigOverride.current = CONFIG
    await payload.delete({ collection: 'telegram-digests', where: { id: { exists: true } } })
    await payload.delete({
      collection: 'payload-jobs',
      where: { taskSlug: { in: [TELEGRAM_POST_TASK, TELEGRAM_DIGEST_EDIT_TASK] } },
    })
    // Oldingi testlarning postlari keyingi slotlar oynasiga tushmasin.
    await deleteTestContent(payload)
    category = await createTestCategory(payload)
    tag = await payload.create({
      collection: 'tags',
      data: { name: "Sun'iy intellekt", slug: testSlug('tag') },
    })
  })

  afterAll(async () => {
    Object.assign(telegramDeps, originalDeps)
    telegramHookDeps.runAfter = originalRunAfter
    telegramConfigOverride.current = undefined
    if (payload) {
      await payload.delete({ collection: 'telegram-digests', where: { id: { exists: true } } })
      await payload.delete({
        collection: 'payload-jobs',
        where: { taskSlug: { in: [TELEGRAM_POST_TASK, TELEGRAM_DIGEST_EDIT_TASK] } },
      })
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
      if (cover) await payload.delete({ collection: 'media', id: cover.id }).catch(() => undefined)
    }
    await payload?.db?.destroy?.()
  })

  it('digest rejimi: chop etish telegram.post qo‘ymaydi; slotda — har kanalga bitta dayjest', async () => {
    const a = await publishedPost('2030-01-15T08:10:00', { title: 'Oddiy yangilik' })
    const b = await publishedPost('2030-01-15T09:40:00', { title: 'Eng yangi yangilik' })
    const c = await publishedPost('2030-01-15T07:30:00', {
      title: 'Kun yangiligi <muhim> & dolzarb',
      digestPriority: 3,
    })
    expect(await jobsOf(TELEGRAM_POST_TASK)).toHaveLength(0)
    expect(afterQueue).toHaveLength(0)
    await flushAfter()
    expect(fake.calls).toHaveLength(0)

    // 07:20 — 07:00 slotining oynasi (kechagi 22:00 dan) bo'sh; 09:55 — 07:00 kechikkan (> 60
    // daqiqa), 10:00 hali kelmagan: hech narsa.
    const early = await run('2030-01-15T07:20:00')
    expect(early.slotAt).toBe(iso('2030-01-15T07:00:00'))
    expect(early.scripts.map((s) => s.status)).toEqual(['empty', 'empty'])
    expect((await run('2030-01-15T09:55:00')).slotAt).toBeNull()
    expect(fake.calls).toHaveLength(0)

    const result = await run('2030-01-15T10:05:00')
    expect(result.slotAt).toBe(iso('2030-01-15T10:00:00'))
    expect(result.scripts.map((s) => s.status)).toEqual(['sent', 'sent'])
    expect(channelSends(LATN)).toHaveLength(1)
    expect(channelSends(CYRL)).toHaveLength(1)

    const latn = digestCaption(LATN)
    expect(latn.startsWith('📰 Kun yangiliklari — 15-yanvar, 10:00\n\n1. <a href="')).toBe(true)
    // Tartib: muhimlik (c), keyin yangisi (b, a); sarlavha escape qilingan.
    expect(latn).toContain('1. <a href="')
    expect(latn.indexOf('Kun yangiligi &lt;muhim&gt; &amp; dolzarb')).toBeLessThan(
      latn.indexOf('Eng yangi yangilik'),
    )
    expect(latn.indexOf('Eng yangi yangilik')).toBeLessThan(latn.indexOf('Oddiy yangilik'))
    expect(latn).toContain(`${ORIGIN}/${category.slug}/${c.slug}?utm_source=telegram`)
    expect(latn).toContain('🔗 Barchasi: <a href="https://blog.odya.uz/?utm_source=telegram')
    expect(latn).toContain('#SuniyIntellekt')

    const cyrl = digestCaption(CYRL)
    expect(cyrl.startsWith('📰 Кун янгиликлари — 15 январ, 10:00')).toBe(true)
    expect(cyrl).toContain(`${ORIGIN}/kr/${category.slug}/${c.slug}?utm_source=telegram`)
    expect(cyrl).toContain('Барчаси:')

    const [first] = channelSends(LATN)
    const row = (await digestRow('uz-Latn', '2030-01-15T10:00:00'))!
    expect(row.status).toBe('sent')
    expect(ids(row.posts)).toEqual([c.id, b.id, a.id])
    expect(ids(row.skippedPosts)).toEqual([])
    if (cover) {
      expect(first!.method).toBe('sendMediaGroup')
      const media = first!.body.media as { type: string; media: string; parse_mode?: string }[]
      expect(media).toHaveLength(3)
      expect(media[0]!.parse_mode).toBe('HTML')
      expect(row.format).toBe('album')
      expect(row.messageIds as string[]).toHaveLength(3)
    } else {
      expect(first!.method).toBe('sendMessage')
      expect(row.format).toBe('text')
    }

    // Takroriy tick (shu slot) — hech narsa yuborilmaydi.
    fake.reset()
    const again = await run('2030-01-15T10:15:00')
    expect(again.scripts.map((s) => s.status)).toEqual(['busy', 'busy'])
    expect(fake.calls).toHaveLength(0)
  })

  it('parallel tick’lar — har kanalga faqat bitta xabar', async () => {
    await publishedPost('2030-01-16T11:00:00')
    await publishedPost('2030-01-16T12:00:00')
    const results = await Promise.all([
      run('2030-01-16T13:01:00'),
      run('2030-01-16T13:01:00'),
      run('2030-01-16T13:02:00'),
    ])
    const statuses = results.flatMap((r) => r.scripts.map((s) => s.status))
    expect(statuses.filter((s) => s === 'sent')).toHaveLength(2)
    expect(statuses.filter((s) => s === 'busy')).toHaveLength(4)
    expect(channelSends(LATN)).toHaveLength(1)
    expect(channelSends(CYRL)).toHaveLength(1)
  })

  it('post ikki dayjestga tushmaydi; sig‘magan post keyin ham yuborilmaydi (maxItems)', async () => {
    telegramConfigOverride.current = {
      ...CONFIG,
      digest: resolveDigestSettings({ maxItems: 2 }),
    }
    const p1 = await publishedPost('2030-01-17T14:00:00', { digestPriority: 1 })
    const p2 = await publishedPost('2030-01-17T15:00:00')
    const p3 = await publishedPost('2030-01-17T14:30:00')
    await run('2030-01-17T16:00:00')
    const row = (await digestRow('uz-Latn', '2030-01-17T16:00:00'))!
    expect(ids(row.posts)).toEqual([p1.id, p2.id])
    expect(ids(row.skippedPosts)).toEqual([p3.id])

    // Oyna eski postlarni ham qamrab olsin (oldingi dayjest slotini orqaga suramiz) — baribir
    // dayjestdagi va sig'magan postlar qayta tanlanmaydi.
    for (const script of ['uz-Latn', 'uz-Cyrl'] as const) {
      const previous = (await digestRow(script, '2030-01-17T16:00:00'))!
      await payload.update({
        collection: 'telegram-digests',
        id: previous.id,
        data: { slotAt: iso('2030-01-17T10:00:00') },
      })
    }
    const p4 = await publishedPost('2030-01-17T17:00:00')
    const p5 = await publishedPost('2030-01-17T18:00:00')
    fake.reset()
    await run('2030-01-17T19:00:00')
    const next = (await digestRow('uz-Latn', '2030-01-17T19:00:00'))!
    expect(ids(next.posts).sort()).toEqual([p4.id, p5.id].sort())
    expect(ids(next.skippedPosts)).toEqual([])
  })

  it('1 post — odatdagi alohida xabar (holat telegram[] da); 0 post — hech narsa', async () => {
    const empty = await run('2030-01-18T07:03:00')
    expect(empty.scripts.map((s) => s.status)).toEqual(['empty', 'empty'])
    expect(fake.calls).toHaveLength(0)
    expect((await digestRow('uz-Latn', '2030-01-18T07:00:00'))!.status).toBe('empty')

    const post = await publishedPost('2030-01-18T08:00:00', { title: 'Yagona yangilik' })
    const result = await run('2030-01-18T10:01:00')
    expect(result.scripts.map((s) => s.status)).toEqual(['single', 'single'])
    expect(fake.callsOf('sendMediaGroup')).toHaveLength(0)
    const [call] = channelSends(LATN)
    expect(call!.method).toBe(cover ? 'sendPhoto' : 'sendMessage')
    expect(String(call!.body.caption ?? call!.body.text)).toContain('<b>Yagona yangilik</b>')
    const state = await readTelegramState(payload, post.id)
    expect(state.map((entry) => entry.script).sort()).toEqual(['uz-Cyrl', 'uz-Latn'])
    expect(state.every((entry) => entry.messageId)).toBe(true)
    const row = (await digestRow('uz-Latn', '2030-01-18T10:00:00'))!
    expect(row.format).toBe('single')
    expect(ids(row.posts)).toEqual([post.id])
  })

  it('dayjestdagi post sarlavhasi tahrirlansa — caption tahrirlanadi (bir marta)', async () => {
    const a = await publishedPost('2030-01-19T11:00:00', { title: 'Eski sarlavha' })
    await publishedPost('2030-01-19T12:00:00', { title: 'Ikkinchi yangilik' })
    await run('2030-01-19T13:00:00')
    const row = (await digestRow('uz-Latn', '2030-01-19T13:00:00'))!
    fake.reset()

    // Sarlavhasiz o'zgarish (qayta chop etish) — job ishlaydi, lekin xesh bir xil: tahrir yo'q.
    await update(a.id, { excerpt: 'Yangi lid.', _status: 'published' })
    expect(await jobsOf(TELEGRAM_DIGEST_EDIT_TASK)).toHaveLength(2)
    await flushAfter()
    expect(fake.calls).toHaveLength(0)

    await update(a.id, { title: 'Yangi sarlavha', _status: 'published' })
    await flushAfter()
    const method = cover ? 'editMessageCaption' : 'editMessageText'
    const edits = fake.callsOf(method)
    expect(edits).toHaveLength(2)
    const latn = edits.find((call) => call.body.chat_id === LATN)!
    expect(latn.body.message_id).toBe(Number((row.messageIds as string[])[0]))
    const text = String(latn.body.caption ?? latn.body.text)
    expect(text).toContain('Yangi sarlavha')
    expect(text).not.toContain('Eski sarlavha')
    expect(text).toContain('Ikkinchi yangilik')
    const cyrl = edits.find((call) => call.body.chat_id === CYRL)!
    expect(String(cyrl.body.caption ?? cyrl.body.text)).toContain('Янги сарлавҳа')
    // Yangi xabar yuborilmagan.
    expect(channelSends(LATN)).toHaveLength(0)
  })

  it('hybrid: "Tezkor" post darhol alohida, qolgani dayjestda; post rejimi — dayjest yo‘q', async () => {
    telegramConfigOverride.current = { ...CONFIG, mode: 'hybrid' }
    const urgent = await publishedPost('2030-01-20T11:00:00', { telegramUrgent: true })
    expect(await jobsOf(TELEGRAM_POST_TASK)).toHaveLength(2)
    await flushAfter()
    expect(channelSends(LATN)).toHaveLength(1)
    const normal = await publishedPost('2030-01-20T11:30:00')
    const other = await publishedPost('2030-01-20T12:00:00')
    expect(await jobsOf(TELEGRAM_POST_TASK)).toHaveLength(0)
    fake.reset()
    await run('2030-01-20T13:00:00')
    const row = (await digestRow('uz-Latn', '2030-01-20T13:00:00'))!
    expect(ids(row.posts).sort()).toEqual([normal.id, other.id].sort())
    expect(ids(row.posts)).not.toContain(urgent.id)

    telegramConfigOverride.current = { ...CONFIG, mode: 'post' }
    const result = await run('2030-01-20T16:00:00')
    expect(result).toEqual({ mode: 'post', slotAt: null, scripts: [] })
  })

  it('Telegram xatosi — `retry`, keyingi tick’da bir marta yuboriladi; rasm rad etilsa — matn', async () => {
    if (!cover) return
    await publishedPost('2030-01-22T11:00:00')
    await publishedPost('2030-01-22T12:00:00')
    // Lotin: 5xx ikki marta (5 s inline kutiladi, keyingisi 30 s — keyingi tick'ga).
    fake.fail({ method: 'sendMediaGroup', code: 502, description: 'Bad Gateway' }, 2)
    const first = await run('2030-01-22T13:00:00')
    expect(first.scripts.map((s) => s.status)).toEqual(['retry', 'sent'])
    const pending = (await digestRow('uz-Latn', '2030-01-22T13:00:00'))!
    expect(pending.status).toBe('retry')
    expect(ids(pending.posts)).toEqual([])
    expect(pending.error).toContain('502')

    fake.reset()
    // Lotin: rasm(lar)ni Telegram ololmadi — matnli xabar bilan yuboriladi.
    fake.fail({
      method: 'sendMediaGroup',
      code: 400,
      description: 'Bad Request: wrong file identifier/HTTP URL specified',
    })
    const second = await run('2030-01-22T13:10:00')
    expect(second.scripts.map((s) => s.status)).toEqual(['sent', 'busy'])
    expect(channelSends(LATN).map((call) => call.method)).toEqual(['sendMediaGroup', 'sendMessage'])
    const row = (await digestRow('uz-Latn', '2030-01-22T13:00:00'))!
    expect(row).toMatchObject({ status: 'sent', format: 'text', attempts: 2, error: null })
    expect(channelSends(CYRL)).toHaveLength(0)
  })

  it('/api/jobs/run?mode=publish — nashr bosqichidan keyin dayjest (javobda telegramDigest)', async () => {
    await publishedPost('2030-01-21T20:00:00')
    await publishedPost('2030-01-21T21:00:00')
    const response = await handleJobsRunRequest(
      new Request('http://localhost:3000/api/jobs/run?mode=publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SECRET}` },
      }),
      { getPayload: async () => payload, secret: SECRET, now: () => at('2030-01-21T22:04:00') },
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as JobsRunResponse
    expect(body.telegramDigest?.slotAt).toBe(iso('2030-01-21T22:00:00'))
    expect(body.telegramDigest?.scripts.map((s) => s.status)).toEqual(['sent', 'sent'])
    expect(channelSends(LATN)).toHaveLength(1)
  })
})
