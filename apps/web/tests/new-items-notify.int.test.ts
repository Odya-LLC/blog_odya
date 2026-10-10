import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_TELEGRAM_TEMPLATE } from '@/globals/TelegramSettings'
import { FEED_POLL_TASK, SCRAPE_ITEM_WORKFLOW } from '@/jobs/constants'
import { newItemsNotifyDeps } from '@/jobs/newItemsNotify'
import { handleJobsRunRequest, type JobsRunResponse } from '@/jobs/runner'
import { scrapeDeps } from '@/jobs/scrapeDeps'
import { mergeScrapingStats } from '@/jobs/stats'
import { feedPollDeps } from '@/jobs/tasks/feedPoll'
import {
  resolveDigestSettings,
  type TelegramConfig,
  telegramConfigOverride,
} from '@/telegram/config'
import { seed } from '@/seed'

import { FeedFixtures, SEED_SOURCES } from './helpers/feeds'
import { initTestPayload } from './helpers/payload'

/**
 * OBLOG-55: `/api/jobs/run` → `feed.poll` (lokal feed fixture'lari) → bitta "yangi yangiliklar"
 * xabari alert chatiga. Telegram — soxta `fetch` (tarmoqqa chiqilmaydi).
 */
const SECRET = 'test-jobs-secret-0123456789abcdef-0123'
const TOKEN = '123456:TEST-token-new-items'
const ALERT_CHAT = '-100555'
const ORIGIN = 'https://blog.odya.uz'
const ACTIVE_SOURCES = SEED_SOURCES.filter((s) => s.isActive)

const CONFIG: TelegramConfig = {
  token: TOKEN,
  channels: {},
  disabled: [],
  template: DEFAULT_TELEGRAM_TEMPLATE,
  hashtagsCount: 3,
  mode: 'post',
  digest: resolveDigestSettings(null),
  alertChatId: ALERT_CHAT,
}

interface SentMessage {
  url: string
  body: { chat_id: string; text: string; parse_mode: string }
}

let payload: Payload
let fixtures: FeedFixtures
const sent: SentMessage[] = []
let telegramStatus = 200
const originalFeedDeps = { ...feedPollDeps }
const originalNotifyDeps = { ...newItemsNotifyDeps }

const telegramFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  sent.push({ url: String(input), body: JSON.parse(String(init?.body)) as SentMessage['body'] })
  return Response.json(
    telegramStatus === 200
      ? { ok: true, result: { message_id: 1 } }
      : { ok: false, error_code: telegramStatus, description: 'Internal Server Error' },
    { status: telegramStatus },
  )
}) as typeof fetch

async function runOk(): Promise<JobsRunResponse> {
  const response = await handleJobsRunRequest(
    new Request('http://localhost:3000/api/jobs/run', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}` },
    }),
    { getPayload: async () => payload, secret: SECRET },
  )
  expect(response.status).toBe(200)
  return (await response.json()) as JobsRunResponse
}

async function makeAllDue() {
  const { docs } = await payload.find({
    collection: 'sources',
    depth: 0,
    pagination: false,
    limit: 0,
  })
  for (const source of docs) {
    await payload.update({
      collection: 'sources',
      id: source.id,
      depth: 0,
      data: {
        lastRequestAt: null,
        feeds: (source.feeds ?? []).map((feed) => ({
          ...feed,
          lastPolledAt: null,
          etag: null,
          lastModified: null,
          failureCount: 0,
          lastErrorKind: null,
          nextPollAt: null,
        })),
      },
    })
  }
}

/** Toza holat: elementlar, job'lar va xabar oynasi o'chiriladi, feed'lar muddati kelgan. */
async function reset() {
  await payload.delete({ collection: 'scraped-items', where: { id: { exists: true } } })
  await payload.delete({
    collection: 'payload-jobs',
    where: {
      or: [
        { taskSlug: { equals: FEED_POLL_TASK } },
        { workflowSlug: { equals: SCRAPE_ITEM_WORKFLOW } },
      ],
    },
  })
  await mergeScrapingStats(payload, { newItems: null })
  await makeAllDue()
}

async function setNotifySettings(data: { notifyNewItems?: boolean; newItemsMinCount?: number }) {
  await payload.updateGlobal({
    slug: 'telegram-settings',
    data: { notifyNewItems: true, newItemsMinCount: 1, ...data },
  })
}

describe('OBLOG-55: yangi yangiliklar xabari', () => {
  beforeAll(async () => {
    payload = await initTestPayload()
    await seed(payload)
    await payload.updateGlobal({
      slug: 'scraping-settings',
      data: {
        isEnabled: true,
        jobsBatchLimit: 10,
        jobsDeadlineSec: 40,
        maxNewItemsPerPoll: 30,
        maxItemAgeHours: 72,
      },
    })
    feedPollDeps.sleep = async () => {}
    scrapeDeps.storage = null
    newItemsNotifyDeps.fetchImpl = telegramFetch
    newItemsNotifyDeps.origin = () => ORIGIN
  })

  beforeEach(async () => {
    fixtures = new FeedFixtures()
    feedPollDeps.fetchImpl = fixtures.fetch
    sent.length = 0
    telegramStatus = 200
    telegramConfigOverride.current = CONFIG
    await setNotifySettings({})
    await reset()
  })

  afterAll(async () => {
    Object.assign(feedPollDeps, originalFeedDeps)
    Object.assign(newItemsNotifyDeps, originalNotifyDeps)
    scrapeDeps.storage = undefined
    telegramConfigOverride.current = undefined
    if (payload) {
      await setNotifySettings({})
      await mergeScrapingStats(payload, { newItems: null })
    }
    await payload?.db?.destroy?.()
  })

  it('bir necha manba (alohida feed.poll job’lari) — tick’da bitta xabar, soni to‘g‘ri', async () => {
    const body = await runOk()
    expect(body.enqueued).toBe(ACTIVE_SOURCES.length)
    expect(body.done.failed).toBe(0)

    const { totalDocs } = await payload.count({ collection: 'scraped-items' })
    expect(totalDocs).toBeGreaterThan(0)
    const expected = ACTIVE_SOURCES.reduce(
      (sum, source) => sum + fixtures.expectedNewItems(source.slug),
      0,
    )
    expect(totalDocs).toBe(expected)

    expect(body.newItems).toEqual({ status: 'sent', count: totalDocs })
    expect(sent).toHaveLength(1)
    const [message] = sent
    expect(message!.url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`)
    expect(message!.body.chat_id).toBe(ALERT_CHAT)
    expect(message!.body.parse_mode).toBe('HTML')
    expect(message!.body.text).toContain(`Yangi yangiliklar: ${totalDocs} ta`)
    expect(message!.body.text).toContain(`href="${ORIGIN}/admin/news-queue"`)
    // Feed mapping'dan (`suggestedCategory`) — rubrikalar qatori, lotin nomlari bilan.
    expect(message!.body.text).toMatch(/\nRubrikalar: [^\n]+ \(\d+\)/)
    // Har bir faol manba (≤ 8) — alohida qator.
    expect(message!.body.text.split('\n').filter((l) => l.startsWith('• '))).toHaveLength(
      Math.min(ACTIVE_SOURCES.length, 8),
    )

    // Keyingi tick: yangi element yo'q — xabar yo'q (oyna siljigan).
    const second = await runOk()
    expect(second.newItems).toEqual({ status: 'none', count: 0 })
    expect(sent).toHaveLength(1)

    // Feed'ga bitta yangi maqola — keyingi xabarda aynan 1 ta.
    const ixbtFeed = SEED_SOURCES.find((s) => s.slug === 'ixbt')!.feeds[0]!.url
    fixtures.addItem(ixbtFeed, {
      link: 'https://www.ixbt.com/news/2026/09/27/oblog-55.html',
      title: 'OBLOG-55',
      publishedAt: new Date(),
    })
    await makeAllDue()
    const third = await runOk()
    expect(third.newItems).toEqual({ status: 'sent', count: 1 })
    expect(sent).toHaveLength(2)
    expect(sent[1]!.body.text).toContain('Yangi yangiliklar: 1 ta')
  })

  it('takror/rad etilgan elementlar hisoblanmaydi', async () => {
    await runOk()
    expect(sent).toHaveLength(1)
    // Oynani qaytaramiz va bitta elementni "duplicate", bittasini "rejected" qilamiz.
    const { docs } = await payload.find({ collection: 'scraped-items', depth: 0, limit: 2 })
    await payload.update({
      collection: 'scraped-items',
      id: docs[0]!.id,
      data: { status: 'duplicate' },
    })
    await payload.update({
      collection: 'scraped-items',
      id: docs[1]!.id,
      data: { status: 'rejected', rejectReason: 'test' },
    })
    await mergeScrapingStats(payload, { newItems: null })
    const { totalDocs } = await payload.count({ collection: 'scraped-items' })
    const body = await runOk()
    expect(body.newItems).toEqual({ status: 'sent', count: totalDocs - 2 })
  })

  it('0 ta yangi — xabar yo‘q', async () => {
    feedPollDeps.fetchImpl = async () => new Response('', { status: 304 })
    const body = await runOk()
    expect(body.newItems).toEqual({ status: 'none', count: 0 })
    expect(sent).toHaveLength(0)
  })

  it('token/alert chat sozlanmagan — xabar yo‘q, job muvaffaqiyatli', async () => {
    telegramConfigOverride.current = { ...CONFIG, alertChatId: undefined }
    const body = await runOk()
    expect(body.done.failed).toBe(0)
    expect(body.newItems?.status).toBe('not-configured')
    telegramConfigOverride.current = { ...CONFIG, token: undefined }
    await makeAllDue()
    expect((await runOk()).newItems?.status).toBe('not-configured')
    expect(sent).toHaveLength(0)
  })

  it('o‘chirilgan (notifyNewItems = false) — xabar yo‘q', async () => {
    await setNotifySettings({ notifyNewItems: false })
    const body = await runOk()
    expect(body.newItems?.status).toBe('disabled')
    expect(sent).toHaveLength(0)
  })

  it('newItemsMinCount: kam bo‘lsa yig‘iladi, chegaraga yetganda bitta xabar', async () => {
    const { totalDocs: before } = await payload.count({ collection: 'scraped-items' })
    expect(before).toBe(0)
    await setNotifySettings({ newItemsMinCount: 1000 })
    const body = await runOk()
    const { totalDocs } = await payload.count({ collection: 'scraped-items' })
    expect(body.newItems).toEqual({ status: 'below-threshold', count: totalDocs })
    expect(sent).toHaveLength(0)
    // Chegara tushirildi — yig'ilgan elementlar bitta xabarda.
    await setNotifySettings({ newItemsMinCount: totalDocs })
    expect((await runOk()).newItems).toEqual({ status: 'sent', count: totalDocs })
    expect(sent).toHaveLength(1)
  })

  it('Telegram 500 — feed.poll va endpoint muvaffaqiyatli, takror xabar yo‘q', async () => {
    telegramStatus = 500
    const body = await runOk()
    expect(body.done.failed).toBe(0)
    expect(body.remaining).toBe(0)
    expect(body.newItems?.status).toBe('failed')
    expect(sent).toHaveLength(1)
    const { totalDocs } = await payload.count({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: FEED_POLL_TASK } },
    })
    // Muvaffaqiyatli job'lar o'chiriladi (`deleteJobOnComplete`) — retry yo'q.
    expect(totalDocs).toBe(0)
    telegramStatus = 200
    expect((await runOk()).newItems?.status).toBe('none')
    expect(sent).toHaveLength(1)
  })
})
