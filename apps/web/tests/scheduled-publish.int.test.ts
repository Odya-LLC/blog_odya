import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { indexNowHookDeps } from '@/collections/Posts/indexnow'
import { makeHookDeps } from '@/collections/Posts/make'
import { telegramHookDeps } from '@/collections/Posts/telegram'
import { DEFAULT_TELEGRAM_TEMPLATE } from '@/globals/TelegramSettings'
import { indexNowDeps } from '@/indexnow'
import {
  DEFAULT_QUEUE,
  FEED_POLL_TASK,
  INDEXNOW_SUBMIT_TASK,
  MAKE_WEBHOOK_TASK,
  SCHEDULE_PUBLISH_TASK,
  TELEGRAM_POST_TASK,
} from '@/jobs/constants'
import { RUNTIME_POOL_MAX } from '@/config/database'
import { runWithDeadline } from '@/jobs/context'
import { handleJobsRunRequest, type JobsRunResponse } from '@/jobs/runner'
import type { Category, Post } from '@/payload-types'
import { makeDeps } from '@/social/make/deliver'
import { telegramDeps } from '@/telegram/autopost'
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
 * Rejalashtirilgan postlar (OBLOG-110): prod'dagi holat — bir vaqtda bir nechta post vaqti
 * keladi, Telegram + Make + IndexNow yoqilgan, pool `max: 3` (prod bilan bir xil).
 */
const ORIGIN = 'https://blog.odya.uz'
const HOOK = 'https://hook.eu2.make.com/test-scheduled-hook'
const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const POSTS = 6

const TELEGRAM: TelegramConfig = {
  token: '123456:TEST-token',
  channels: {
    'uz-Latn': { script: 'uz-Latn', chatId: '@odya_latn_test', source: 'settings' },
  },
  disabled: ['uz-Cyrl'],
  template: DEFAULT_TELEGRAM_TEMPLATE,
  hashtagsCount: 0,
}

let payload: Payload
let users: TestUsers
let category: Category
const fake = new FakeTelegram()
const makeCalls: string[] = []
const indexNowCalls: string[] = []
const original = {
  telegram: { ...telegramDeps },
  make: { ...makeDeps },
  indexNow: { ...indexNowDeps },
  telegramAfter: telegramHookDeps.runAfter,
  makeAfter: makeHookDeps.runAfter,
  indexNowAfter: indexNowHookDeps.runAfter,
}
let socialBefore: Record<string, unknown> | null = null
let scrapingBefore: Record<string, unknown> | null = null

async function update(id: number, data: Partial<Post>) {
  return payload.update({ collection: 'posts', id, data, ...as(users.editor) })
}

/** `scheduled` holatidagi postlar; vaqti `delayMs` dan keyin keladi. */
async function schedulePosts(count: number, delayMs: number): Promise<number[]> {
  const at = new Date(Date.now() + delayMs).toISOString()
  const ids: number[] = []
  for (let i = 0; i < count; i++) {
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: `Rejalashtirilgan maqola ${i + 1}`,
        excerpt: 'Rejalashtirilgan maqola lidi — vaqtida chiqishi kerak.',
        slug: testSlug(`sched-${i}`),
        category: category.id,
        workflowStatus: 'draft',
      },
      ...as(users.editor),
    })
    await update(post.id, { workflowStatus: 'in_progress' })
    await update(post.id, { workflowStatus: 'review' })
    await update(post.id, { workflowStatus: 'scheduled', scheduledAt: at })
    ids.push(post.id)
  }
  return ids
}

async function jobsOf(task: string, postIds: number[]) {
  const { docs } = await payload.find({
    collection: 'payload-jobs',
    where: { taskSlug: { equals: task } },
    depth: 0,
    pagination: false,
    limit: 0,
  })
  return docs.filter((job) => {
    const input = job.input as { postId?: number; doc?: { value?: unknown } } | null
    const id = input?.postId ?? Number(input?.doc?.value)
    return postIds.includes(id)
  })
}

async function statuses(ids: number[]) {
  const { docs } = await payload.find({
    collection: 'posts',
    where: { id: { in: ids } },
    depth: 0,
    pagination: false,
    select: { workflowStatus: true, _status: true },
  })
  return docs.map((doc) => doc.workflowStatus)
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('rejalashtirilgan postlar: bir vaqtda bir nechtasi (OBLOG-110)', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await deleteTestContent(payload)
    await deleteTestUsers(payload)
    await payload.delete({
      collection: 'payload-jobs',
      where: {
        taskSlug: {
          in: [
            SCHEDULE_PUBLISH_TASK,
            TELEGRAM_POST_TASK,
            MAKE_WEBHOOK_TASK,
            INDEXNOW_SUBMIT_TASK,
            FEED_POLL_TASK,
          ],
        },
      },
    })
    users = await createTestUsers(payload)
    category = await createTestCategory(payload)
    // Prod sozlamasi: 10 ta parallel (scraping) job. Yangi feed.poll'lar navbatga qo'yilmaydi
    // (tarmoq yo'q) — scraping job'larini test o'zi qo'yadi (`queueDummyPolls`).
    const scraping = await payload.findGlobal({ slug: 'scraping-settings', depth: 0 })
    scrapingBefore = { isEnabled: scraping.isEnabled, jobsBatchLimit: scraping.jobsBatchLimit }
    await payload.updateGlobal({
      slug: 'scraping-settings',
      data: { isEnabled: false, jobsBatchLimit: 10 },
    })

    // Telegram — soxta Bot API; Make — haqiqiy `social-settings` global'i (DB o'qiladi).
    telegramConfigOverride.current = TELEGRAM
    telegramDeps.createApi = fake.api
    telegramDeps.origin = () => ORIGIN
    telegramDeps.sleep = async () => {}
    socialBefore = (await payload.findGlobal({ slug: 'social-settings', depth: 0 })) as never
    await payload.updateGlobal({
      slug: 'social-settings',
      data: { enabled: true, webhookUrl: HOOK, scripts: ['uz-Latn'] },
    })
    makeDeps.fetch = async (input) => {
      makeCalls.push(String(input))
      return new Response('Accepted', { status: 200 })
    }
    makeDeps.origin = () => ORIGIN
    indexNowDeps.key = () => KEY
    indexNowDeps.origin = () => ORIGIN
    indexNowDeps.indexingAllowed = () => true
    indexNowDeps.fetch = async (input) => {
      indexNowCalls.push(String(input))
      return new Response(null, { status: 200 })
    }
    // `after()` test muhitida yo'q — runner o'zi bajarishi kerak.
    const never = () => false
    telegramHookDeps.runAfter = never
    makeHookDeps.runAfter = never
    indexNowHookDeps.runAfter = never
  })

  beforeEach(() => {
    fake.reset()
    makeCalls.length = 0
    indexNowCalls.length = 0
  })

  afterAll(async () => {
    Object.assign(telegramDeps, original.telegram)
    Object.assign(makeDeps, original.make)
    Object.assign(indexNowDeps, original.indexNow)
    telegramHookDeps.runAfter = original.telegramAfter
    makeHookDeps.runAfter = original.makeAfter
    indexNowHookDeps.runAfter = original.indexNowAfter
    telegramConfigOverride.current = undefined
    if (payload) {
      if (socialBefore) {
        await payload.updateGlobal({
          slug: 'social-settings',
          data: {
            enabled: (socialBefore.enabled as boolean | null) ?? false,
            webhookUrl: (socialBefore.webhookUrl as string | null) ?? null,
            scripts: socialBefore.scripts as never,
          },
        })
      }
      if (scrapingBefore) {
        await payload.updateGlobal({ slug: 'scraping-settings', data: scrapingBefore as never })
      }
      await payload.delete({
        collection: 'payload-jobs',
        where: {
          taskSlug: {
            in: [TELEGRAM_POST_TASK, MAKE_WEBHOOK_TASK, INDEXNOW_SUBMIT_TASK, FEED_POLL_TASK],
          },
        },
      })
      await payload.delete({ collection: 'social-deliveries', where: { id: { exists: true } } })
      await deleteTestContent(payload)
      await deleteTestUsers(payload)
    }
    await payload?.db?.destroy?.()
  })

  it(`pool max ${RUNTIME_POOL_MAX}: ${POSTS} ta post parallel (limit 10) — hammasi chop etiladi`, async () => {
    const ids = await schedulePosts(POSTS, 1_500)
    await wait(2_000)
    const run = await runWithDeadline({ taskDeadlineAt: Date.now() + 60_000 }, () =>
      payload.jobs.run({
        queue: DEFAULT_QUEUE,
        where: { taskSlug: { equals: SCHEDULE_PUBLISH_TASK } },
        limit: 10,
      }),
    )
    const results = Object.values(run.jobStatus ?? {}).map((s) => s.status)
    expect(results).toHaveLength(POSTS)
    expect(results.every((status) => status === 'success')).toBe(true)
    expect(await statuses(ids)).toEqual(ids.map(() => 'published'))
    // Publish tranzaksiyasida har postga bittadan Telegram/Make/IndexNow job'i qo'yilgan.
    for (const task of [TELEGRAM_POST_TASK, MAKE_WEBHOOK_TASK]) {
      expect(await jobsOf(task, ids)).toHaveLength(POSTS)
    }
    const { totalDocs: indexNowJobs } = await payload.count({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: INDEXNOW_SUBMIT_TASK } },
    })
    expect(indexNowJobs).toBe(POSTS)
    // Keyingi testlar o'z sanog'i bilan boshlansin.
    await payload.delete({
      collection: 'payload-jobs',
      where: {
        taskSlug: { in: [TELEGRAM_POST_TASK, MAKE_WEBHOOK_TASK, INDEXNOW_SUBMIT_TASK] },
      },
    })
  })

  it('mode=publish: scraping navbati to‘la bo‘lsa ham — hammasi chiqadi, Telegram/Make/IndexNow bir martadan', async () => {
    // Scraping job'lari publish'dan OLDIN navbatga qo'yilgan (FIFO bo'yicha birinchi bo'lardi).
    const polls = await queueDummyPolls(5)
    const ids = await schedulePosts(POSTS, 1_500)
    // Prod'dagi holat: birinchi post job'i bir urinishda xato bilan tugagan (retry yo'q).
    const [failed] = await jobsOf(SCHEDULE_PUBLISH_TASK, [ids[0]!])
    await payload.update({
      collection: 'payload-jobs',
      id: failed!.id,
      data: { hasError: true, totalTried: 1, processing: false },
    })
    await wait(2_000)

    const body = await runEndpoint('publish')
    expect(body).toMatchObject({
      mode: 'publish',
      scheduledPublish: { queued: 1, failed: 0 },
      enqueued: 0,
      alerts: null,
      newItems: null,
      remaining: 0,
      deadlineReached: false,
    })
    expect(body.phases.scrape).toBeNull()
    // schedulePublish (6, bittasi qayta qo'yilgan) + telegram.post + make.webhook + indexnow.submit.
    expect(body.phases.publish).toMatchObject({ succeeded: POSTS * 4, failed: 0 })
    expect(await statuses(ids)).toEqual(ids.map(() => 'published'))
    expect(fake.callsOf('sendMessage')).toHaveLength(POSTS)
    expect(makeCalls).toHaveLength(POSTS)
    expect(indexNowCalls).toHaveLength(POSTS)
    // Scraping job'lariga tegilmagan.
    expect(await pendingPolls(polls)).toBe(polls.length)

    // Keyingi tick — hech narsa takrorlanmaydi.
    const again = await runEndpoint('publish')
    expect(again.done).toEqual({ succeeded: 0, failed: 0 })
    expect(again.scheduledPublish).toEqual({ queued: 0, failed: 0 })
    expect(fake.callsOf('sendMessage')).toHaveLength(POSTS)
    expect(makeCalls).toHaveLength(POSTS)
    expect(indexNowCalls).toHaveLength(POSTS)
    for (const task of [TELEGRAM_POST_TASK, MAKE_WEBHOOK_TASK]) {
      expect(await jobsOf(task, ids)).toHaveLength(0) // deleteJobOnComplete
    }
  })

  it('mode=scrape: nashr job’lariga tegmaydi, scraping job’larini bajaradi; mode=publish keyin chiqaradi', async () => {
    const polls = await queueDummyPolls(3)
    const [id] = await schedulePosts(1, 1_500)
    await wait(2_000)

    const body = await runEndpoint('scrape')
    expect(body.mode).toBe('scrape')
    expect(body.phases.publish).toBeNull()
    expect(body.scheduledPublish).toBeNull()
    expect(await pendingPolls(polls)).toBe(0)
    expect(await statuses([id!])).toEqual(['scheduled'])

    const publish = await runEndpoint('publish')
    expect(publish.phases.publish).toMatchObject({ succeeded: 4, failed: 0 })
    expect(await statuses([id!])).toEqual(['published'])
  })

  it('mode yo‘q (all, eski cron): avval nashr bosqichi, keyin scraping', async () => {
    const polls = await queueDummyPolls(4)
    const ids = await schedulePosts(2, 1_500)
    await wait(2_000)

    const body = await runEndpoint()
    expect(body.mode).toBe('all')
    expect(body.phases.publish).toMatchObject({ succeeded: 2 * 4, failed: 0 })
    expect(body.phases.scrape!.succeeded).toBeGreaterThanOrEqual(polls.length)
    expect(body.phases.scrape!.failed).toBe(0)
    expect(await statuses(ids)).toEqual(['published', 'published'])
    expect(await pendingPolls(polls)).toBe(0)
  })

  it('noto‘g‘ri mode — 400', async () => {
    const response = await callEndpoint('?mode=everything')
    expect(response.status).toBe(400)
  })
})

const SECRET = 'test-jobs-secret-0123456789abcdef-0123'

async function callEndpoint(query: string) {
  return handleJobsRunRequest(
    new Request(`http://localhost:3000/api/jobs/run${query}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}` },
    }),
    { getPayload: async () => payload, secret: SECRET },
  )
}

/** `mode` siz — `all` (eski `cron.sql` va GitHub zaxirasi shunday chaqiradi). */
async function runEndpoint(mode?: 'publish' | 'scrape'): Promise<JobsRunResponse> {
  const response = await callEndpoint(mode ? `?mode=${mode}` : '')
  expect(response.status).toBe(200)
  return (await response.json()) as JobsRunResponse
}

/** Mavjud bo'lmagan manbalar uchun `feed.poll` — tarmoqsiz, darhol tugaydi. */
async function queueDummyPolls(count: number): Promise<(number | string)[]> {
  const ids: (number | string)[] = []
  for (let i = 0; i < count; i++) {
    const job = await payload.jobs.queue({
      task: FEED_POLL_TASK,
      input: { sourceId: 990_000 + Math.floor(Math.random() * 9_999) },
    })
    ids.push(job.id)
  }
  return ids
}

async function pendingPolls(ids: (number | string)[]): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: 'payload-jobs',
    where: {
      and: [
        { id: { in: ids } },
        { completedAt: { exists: false } },
        { processing: { equals: false } },
      ],
    },
  })
  return totalDocs
}
