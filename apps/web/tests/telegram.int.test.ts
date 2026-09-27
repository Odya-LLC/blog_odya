import type { Payload } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { telegramHookDeps } from '@/collections/Posts/telegram'
import { DEFAULT_TELEGRAM_TEMPLATE } from '@/globals/TelegramSettings'
import { DEFAULT_QUEUE, TELEGRAM_POST_TASK } from '@/jobs/constants'
import { runWithDeadline } from '@/jobs/context'
import type { Category, Media, Post, Tag } from '@/payload-types'
import { readTelegramState, saveTelegramEntry, telegramDeps } from '@/telegram/autopost'
import { type TelegramConfig, telegramConfigOverride } from '@/telegram/config'

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
 * Telegram avtopost (TZ §7.1, TASKS M3-01) — Postgres (+ MinIO muqova uchun) va soxta Bot API
 * (haqiqiy grammY `Api`, `fetch` — `helpers/telegram.ts`). Haqiqiy Telegram'ga chiqilmaydi.
 *
 * `after()` (Next.js) test muhitida yo'q — `telegramHookDeps.runAfter` vazifalarni yig'adi,
 * `flushAfter()` ularni "javobdan keyin" bajaradi.
 */
const TOKEN = '123456:TEST-token'
const ALERT_CHAT = '-100999'
const ORIGIN = 'https://blog.odya.uz'

const CONFIG: TelegramConfig = {
  token: TOKEN,
  channels: {
    'uz-Latn': { script: 'uz-Latn', chatId: '@odya_latn_test', source: 'settings' },
    'uz-Cyrl': { script: 'uz-Cyrl', chatId: '@odya_cyrl_test', source: 'settings' },
  },
  disabled: [],
  template: DEFAULT_TELEGRAM_TEMPLATE,
  hashtagsCount: 3,
  alertChatId: ALERT_CHAT,
}

let payload: Payload
let users: TestUsers
let category: Category
let tag: Tag
let cover: Media | null = null
const fake = new FakeTelegram()
const originalDeps = { ...telegramDeps }
const originalRunAfter = telegramHookDeps.runAfter
const afterQueue: (() => Promise<void>)[] = []
const sleeps: number[] = []

async function flushAfter() {
  while (afterQueue.length) await afterQueue.shift()!()
}

async function update(id: number, data: Partial<Post>, draft = false) {
  return payload.update({ collection: 'posts', id, data, draft, ...as(users.editor) })
}

async function newPost(overrides: Partial<Post> = {}): Promise<Post> {
  return payload.create({
    collection: 'posts',
    data: {
      title: 'Yangi model taqdim etildi',
      excerpt: 'Kompaniya yangi sun’iy intellekt modelini e’lon qildi.',
      slug: testSlug('tg'),
      category: category.id,
      tags: [tag.id],
      workflowStatus: 'draft',
      ...overrides,
    },
    ...as(users.editor),
  })
}

async function postInReview(overrides: Partial<Post> = {}): Promise<Post> {
  const post = await newPost(overrides)
  await update(post.id, { workflowStatus: 'in_progress' })
  return update(post.id, { workflowStatus: 'review' })
}

async function publish(id: number, data: Partial<Post> = {}) {
  return update(id, { ...data, _status: 'published' })
}

async function telegramJobs(postId: number) {
  const { docs } = await payload.find({
    collection: 'payload-jobs',
    where: {
      and: [{ taskSlug: { equals: TELEGRAM_POST_TASK } }, { 'input.postId': { equals: postId } }],
    },
    depth: 0,
    limit: 20,
  })
  return docs
}

const state = (postId: number) => readTelegramState(payload, postId)

describe('Telegram avtopost (telegram.post)', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await deleteTestContent(payload)
    await deleteTestUsers(payload)
    await payload.delete({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: TELEGRAM_POST_TASK } },
    })
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
    tag = await payload.create({
      collection: 'tags',
      data: { name: "Sun'iy intellekt", slug: testSlug('tag') },
    })
    try {
      const data = await sharp({
        create: { width: 1200, height: 800, channels: 3, background: '#224488' },
      })
        .jpeg()
        .toBuffer()
      cover = await payload.create({
        collection: 'media',
        data: { alt: 'Muqova', license: 'own' },
        file: { data, mimetype: 'image/jpeg', name: 'tg-muqova.jpg', size: data.length },
      })
    } catch (error) {
      // MinIO ishlamasa — muqovali test o'tkazib yuboriladi (qolganlari rasmsiz).
      console.warn('MinIO yo‘q — muqovasiz davom etiladi', error)
    }

    telegramConfigOverride.current = CONFIG
    telegramDeps.createApi = fake.api
    telegramDeps.origin = () => ORIGIN
    telegramDeps.sleep = async (ms) => {
      sleeps.push(ms)
    }
    telegramHookDeps.runAfter = (task) => {
      afterQueue.push(task)
      return true
    }
  })

  beforeEach(() => {
    fake.reset()
    sleeps.length = 0
    afterQueue.length = 0
    telegramConfigOverride.current = CONFIG
    telegramDeps.inlineWaitMaxMs = originalDeps.inlineWaitMaxMs
  })

  afterAll(async () => {
    Object.assign(telegramDeps, originalDeps)
    telegramHookDeps.runAfter = originalRunAfter
    telegramConfigOverride.current = undefined
    if (payload) {
      await payload.delete({
        collection: 'payload-jobs',
        where: { taskSlug: { equals: TELEGRAM_POST_TASK } },
      })
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
      if (cover) await payload.delete({ collection: 'media', id: cover.id }).catch(() => undefined)
    }
    await payload?.db?.destroy?.()
  })

  it('publish → lotin kanalga lotin, kirill kanalga kirill xabar (rasm, sarlavha, lid, havola)', async () => {
    if (!cover) return
    const post = await postInReview({ coverImage: cover.id })
    await publish(post.id)

    // Job'lar navbatda, darhol bajarish `after()` ga topshirilgan.
    expect(await telegramJobs(post.id)).toHaveLength(2)
    expect(fake.calls).toHaveLength(0)
    await flushAfter()

    const photos = fake.callsOf('sendPhoto')
    expect(photos).toHaveLength(2)
    expect(fake.tokens.every((token) => token === TOKEN)).toBe(true)
    const latn = photos.find((c) => c.body.chat_id === '@odya_latn_test')!
    const cyrl = photos.find((c) => c.body.chat_id === '@odya_cyrl_test')!

    expect(latn.body.parse_mode).toBe('HTML')
    expect(String(latn.body.photo)).toMatch(/og.*\.webp$|\.webp$/)
    const latnCaption = String(latn.body.caption)
    expect(latnCaption).toContain('<b>Yangi model taqdim etildi</b>')
    expect(latnCaption).toContain('Kompaniya yangi')
    expect(latnCaption).toContain(
      `${ORIGIN}/${category.slug}/${post.slug}?utm_source=telegram&amp;utm_medium=channel&amp;utm_campaign=latn`,
    )
    expect(latnCaption).toContain('Batafsil:')
    expect(latnCaption).toContain('#SuniyIntellekt')

    const cyrlCaption = String(cyrl.body.caption)
    expect(cyrlCaption).toContain('<b>Янги модель тақдим этилди</b>')
    expect(cyrlCaption).toContain('Батафсил:')
    expect(cyrlCaption).toContain(`${ORIGIN}/kr/${category.slug}/${post.slug}?`)
    expect(cyrlCaption).toContain('utm_campaign=cyrl')
    expect(cyrlCaption).toMatch(/#[А-Яа-яЎўҚқҒғҲҳ]+/)

    const entries = await state(post.id)
    expect(entries.map((e) => e.script)).toEqual(['uz-Latn', 'uz-Cyrl'])
    for (const entry of entries) {
      expect(entry.messageId).toMatch(/^\d+$/)
      expect(entry.kind).toBe('photo')
      expect(entry.hash).toBeTruthy()
      expect(entry.sentAt).toBeTruthy()
      expect(entry.error).toBeNull()
    }
    // Bajarilgan job'lar o'chiriladi (`deleteJobOnComplete`).
    expect(await telegramJobs(post.id)).toHaveLength(0)
  })

  it('rasmsiz — sendMessage (havola preview bilan)', async () => {
    const post = await postInReview()
    await publish(post.id)
    await flushAfter()
    const messages = fake.callsOf('sendMessage')
    expect(messages).toHaveLength(2)
    expect(fake.callsOf('sendPhoto')).toHaveLength(0)
    const latn = messages.find((c) => c.body.chat_id === '@odya_latn_test')!
    expect(latn.body.link_preview_options).toMatchObject({
      url: expect.stringContaining(`/${category.slug}/${post.slug}?`),
    })
    expect((await state(post.id)).every((e) => e.kind === 'text' && e.messageId)).toBe(true)
  })

  it('qayta saqlash/publish — dublikat yo‘q; sarlavha o‘zgarsa — xabar tahrirlanadi', async () => {
    const post = await postInReview()
    await publish(post.id)
    await flushAfter()
    const [latnBefore, cyrlBefore] = await state(post.id)
    fake.reset()

    // O'zgarishsiz qayta publish — job ishlaydi, lekin Telegram chaqirilmaydi.
    await publish(post.id)
    await flushAfter()
    expect(fake.calls).toHaveLength(0)

    // Qoralama (autosave) — trigger emas, holat yo'qolmaydi.
    await update(post.id, { title: 'Yangilangan sarlavha' }, true)
    expect(afterQueue).toHaveLength(0)
    expect(await telegramJobs(post.id)).toHaveLength(0)
    expect((await state(post.id))[0]?.messageId).toBe(latnBefore!.messageId)

    // Qoralamani chop etish — sarlavha o'zgargan: editMessageText (sendMessage emas).
    await publish(post.id, { title: 'Yangilangan sarlavha' })
    await flushAfter()
    expect(fake.callsOf('sendMessage')).toHaveLength(0)
    const edits = fake.callsOf('editMessageText')
    expect(edits).toHaveLength(2)
    const latnEdit = edits.find((c) => c.body.chat_id === '@odya_latn_test')!
    expect(latnEdit.body.message_id).toBe(Number(latnBefore!.messageId))
    expect(String(latnEdit.body.text)).toContain('<b>Yangilangan sarlavha</b>')
    const cyrlEdit = edits.find((c) => c.body.chat_id === '@odya_cyrl_test')!
    expect(cyrlEdit.body.message_id).toBe(Number(cyrlBefore!.messageId))
    expect(String(cyrlEdit.body.text)).toContain('<b>Янгиланган сарлавҳа</b>')

    const after = await state(post.id)
    expect(after[0]!.messageId).toBe(latnBefore!.messageId)
    expect(after[0]!.hash).not.toBe(latnBefore!.hash)
    expect(after[0]!.sentAt).toBe(latnBefore!.sentAt)
  })

  it('muqovali xabar tahrirlanganda — editMessageCaption', async () => {
    if (!cover) return
    const post = await postInReview({ coverImage: cover.id })
    await publish(post.id)
    await flushAfter()
    fake.reset()
    await publish(post.id, { excerpt: 'Yangi lid matni.' })
    await flushAfter()
    const edits = fake.callsOf('editMessageCaption')
    expect(edits).toHaveLength(2)
    const latnEdit = edits.find((c) => c.body.chat_id === '@odya_latn_test')!
    expect(String(latnEdit.body.caption)).toContain('Yangi lid matni.')
    const cyrlEdit = edits.find((c) => c.body.chat_id === '@odya_cyrl_test')!
    expect(String(cyrlEdit.body.caption)).toContain('Янги лид матни.')
    expect(fake.callsOf('sendPhoto')).toHaveLength(0)
  })

  it('429: retry_after hurmat qilinadi (qisqa — task ichida kutiladi)', async () => {
    const post = await postInReview()
    fake.fail({ method: 'sendMessage', code: 429, description: 'Too Many Requests', retryAfter: 3 })
    await publish(post.id)
    await flushAfter()
    expect(sleeps).toContain(3_000)
    // 1 ta rad etilgan + 2 ta muvaffaqiyatli (dublikatsiz).
    expect(fake.callsOf('sendMessage')).toHaveLength(3)
    expect((await state(post.id)).every((e) => e.messageId && !e.error)).toBe(true)
  })

  it('429: uzun retry_after — job waitUntil bilan qayta navbatga, keyingi tsiklda yuboriladi', async () => {
    const post = await postInReview({ telegramSkip: false })
    telegramConfigOverride.current = {
      ...CONFIG,
      channels: { 'uz-Latn': CONFIG.channels['uz-Latn'] },
    }
    fake.fail({
      method: 'sendMessage',
      code: 429,
      description: 'Too Many Requests',
      retryAfter: 60,
    })
    const before = Date.now()
    await publish(post.id)
    await flushAfter()

    const jobs = await telegramJobs(post.id)
    expect(jobs).toHaveLength(1)
    expect((jobs[0]!.input as { attempt?: number }).attempt).toBe(1)
    expect(new Date(jobs[0]!.waitUntil!).getTime()).toBeGreaterThanOrEqual(before + 59_000)
    const [entry] = await state(post.id)
    expect(entry).toMatchObject({ script: 'uz-Latn', messageId: null })
    expect(entry!.error).toContain('429')
    expect(fake.callsOf('sendMessage').filter((c) => c.body.chat_id === ALERT_CHAT)).toHaveLength(0)

    // Keyingi scheduler tsikli (waitUntil o'tgan).
    await payload.update({
      collection: 'payload-jobs',
      id: jobs[0]!.id,
      data: { waitUntil: new Date(Date.now() - 1000).toISOString() },
    })
    await runWithDeadline({ taskDeadlineAt: Date.now() + 30_000 }, () =>
      payload.jobs.run({
        queue: DEFAULT_QUEUE,
        where: { taskSlug: { equals: TELEGRAM_POST_TASK } },
      }),
    )
    const [sent] = await state(post.id)
    expect(sent!.messageId).toMatch(/^\d+$/)
    expect(sent!.error).toBeNull()
  })

  it('3 marta qayta urinishdan keyin — alertChatId ga ogohlantirish, xato holatda yoziladi', async () => {
    telegramDeps.inlineWaitMaxMs = Number.POSITIVE_INFINITY
    telegramConfigOverride.current = {
      ...CONFIG,
      channels: { 'uz-Cyrl': CONFIG.channels['uz-Cyrl'] },
    }
    const post = await postInReview()
    fake.fail({ method: 'sendMessage', code: 502, description: 'Bad Gateway' }, 4)
    await publish(post.id)
    await flushAfter()

    const sends = fake.callsOf('sendMessage')
    const toChannel = sends.filter((c) => c.body.chat_id === '@odya_cyrl_test')
    expect(toChannel).toHaveLength(4) // 1 + 3 retry
    expect(sleeps).toEqual([5_000, 30_000, 120_000])
    const alerts = sends.filter((c) => c.body.chat_id === ALERT_CHAT)
    expect(alerts).toHaveLength(1)
    expect(String(alerts[0]!.body.text)).toContain('Telegram avtopost')
    expect(String(alerts[0]!.body.text)).toContain('502')
    const [entry] = await state(post.id)
    expect(entry).toMatchObject({ script: 'uz-Cyrl', messageId: null })
    expect(entry!.error).toContain('502')

    // Keyingi publish xato bergan kanalni qayta urinadi.
    fake.reset()
    await publish(post.id)
    await flushAfter()
    expect(
      fake.callsOf('sendMessage').filter((c) => c.body.chat_id === '@odya_cyrl_test'),
    ).toHaveLength(1)
    expect((await state(post.id))[0]!.error).toBeNull()
  })

  it('token/kanal sozlanmagan — xato yo‘q, faqat warning log', async () => {
    const warn = vi.spyOn(payload.logger, 'warn')
    try {
      telegramConfigOverride.current = { ...CONFIG, token: undefined }
      const post = await postInReview()
      await expect(publish(post.id)).resolves.toMatchObject({ workflowStatus: 'published' })
      expect(await telegramJobs(post.id)).toHaveLength(0)
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ msg: expect.stringContaining('TELEGRAM_BOT_TOKEN') }),
      )

      // Kirill kanal env'da yo'q (production holati) — faqat lotin job'i, kirill uchun warning.
      warn.mockClear()
      telegramConfigOverride.current = {
        ...CONFIG,
        channels: { 'uz-Latn': CONFIG.channels['uz-Latn'] },
      }
      const second = await postInReview()
      await publish(second.id)
      const jobs = await telegramJobs(second.id)
      expect(jobs.map((job) => (job.input as { script: string }).script)).toEqual(['uz-Latn'])
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          script: 'uz-Cyrl',
          msg: expect.stringContaining('kanali sozlanmagan'),
        }),
      )
      await flushAfter()
      expect(fake.callsOf('sendMessage')).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('parallel job holatlari bir-birini ezmaydi (lotin va kirill bir vaqtda yozadi)', async () => {
    const post = await newPost()
    for (let round = 0; round < 5; round++) {
      await Promise.all(
        (['uz-Latn', 'uz-Cyrl'] as const).map((script) =>
          saveTelegramEntry(payload, post.id, {
            script,
            chatId: `@${script}`,
            messageId: `${round}${script === 'uz-Latn' ? 1 : 2}`,
            kind: 'text',
            hash: `h${round}`,
            sentAt: new Date().toISOString(),
            error: null,
          }),
        ),
      )
      const entries = await state(post.id)
      expect(entries.map((e) => [e.script, e.messageId])).toEqual([
        ['uz-Latn', `${round}1`],
        ['uz-Cyrl', `${round}2`],
      ])
    }
  })

  it('telegramSkip — yuborilmaydi', async () => {
    const post = await postInReview({ telegramSkip: true })
    await publish(post.id)
    expect(await telegramJobs(post.id)).toHaveLength(0)
    expect(afterQueue).toHaveLength(0)
  })

  it('rejalashtirilgan publish (schedulePublish job) — runner shu tsiklda yuboradi', async () => {
    const post = await postInReview()
    await update(post.id, {
      workflowStatus: 'scheduled',
      scheduledAt: new Date(Date.now() + 1_500).toISOString(),
    })
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    const run = () =>
      runWithDeadline({ taskDeadlineAt: Date.now() + 30_000 }, () =>
        payload.jobs.run({
          queue: DEFAULT_QUEUE,
          where: { taskSlug: { in: ['schedulePublish', TELEGRAM_POST_TASK] } },
        }),
      )
    await run() // schedulePublish → publish → telegram.post navbatga (after() emas)
    expect(afterQueue).toHaveLength(0)
    const published = await payload.findByID({ collection: 'posts', id: post.id, depth: 0 })
    expect(published.workflowStatus).toBe('published')
    await run() // runner'ning keyingi batch'i
    expect(fake.callsOf('sendMessage')).toHaveLength(2)
    expect((await state(post.id)).every((e) => e.messageId)).toBe(true)
  })

  it('holat versiyadagi eskirgan qiymat bilan ezilmaydi; nusxa bo‘sh holat bilan boshlanadi', async () => {
    const post = await postInReview()
    await publish(post.id)
    await flushAfter()
    const sent = await state(post.id)
    expect(sent).toHaveLength(2)

    // Admin formasi (yoki API) eski/bo'sh `telegram` yuborsa ham — asosiy jadval qiymati qoladi.
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { telegram: [], _status: 'published' },
      overrideAccess: true,
    })
    await flushAfter()
    expect((await state(post.id)).map((e) => e.messageId)).toEqual(sent.map((e) => e.messageId))
    expect(fake.callsOf('sendMessage')).toHaveLength(2) // faqat birinchi publish

    const copy = await payload.duplicate({
      collection: 'posts',
      id: post.id,
      data: { workflowStatus: 'draft', _status: 'draft', slug: testSlug('tg-copy') },
      overrideAccess: true,
    })
    expect(await state(copy.id)).toEqual([])
    await payload.delete({ collection: 'posts', id: copy.id })

    // Boshqa maydonlar (sarlavha, kategoriya, teglar) holat yozilganda o'zgarmaydi.
    const doc = await payload.findByID({ collection: 'posts', id: post.id, depth: 0 })
    expect(doc.title).toBe('Yangi model taqdim etildi')
    expect(doc.category).toBe(category.id)
    expect(doc.tags).toEqual([tag.id])
  })
})
