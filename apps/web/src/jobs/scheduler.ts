import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import type { Payload, Where } from 'payload'

import { localDate } from '@/editorial/queue'

import { DUE_SLACK_MS, FEED_POLL_TASK, MAINTENANCE_CLEANUP_TASK, STALE_JOB_MS } from './constants'
import { getJobsSettings, type JobsSettings } from './settings'
import { claimDailyCleanup } from './stats'

/**
 * Scheduler (TZ §3.5): har chaqiruvda (pg_cron → `/api/jobs/run`, yoki `autorun` tick'i)
 * muddati kelgan faol manbalar uchun `feed.poll` job'ini navbatga qo'yadi.
 *
 * - Manba "muddati kelgan" — kamida bitta faol feed `pollIntervalMin` dan beri o'qilmagan.
 * - Bitta manba uchun bir vaqtda bitta tugallanmagan `feed.poll` (retry kutayotgani ham) —
 *   takror navbat yo'q, `sources.feeds[]` holatini faqat bitta job yozadi.
 */

interface FeedPollState {
  isActive?: boolean | null
  lastPolledAt?: string | null
}

export function isFeedDue(feed: FeedPollState, intervalMin: number, now: number): boolean {
  if (feed.isActive === false) return false
  if (!feed.lastPolledAt) return true
  const last = Date.parse(feed.lastPolledAt)
  if (Number.isNaN(last)) return true
  return now - last >= intervalMin * 60_000 - DUE_SLACK_MS
}

/** Tugallanmagan va yakuniy xatoga uchramagan job'lar sharti. */
const unfinished: Where[] = [{ completedAt: { exists: false } }, { hasError: { not_equals: true } }]

async function sourcesWithPendingPoll(payload: Payload): Promise<Set<number>> {
  const { docs } = await payload.find({
    collection: 'payload-jobs',
    where: { and: [{ taskSlug: { equals: FEED_POLL_TASK } }, ...unfinished] },
    depth: 0,
    pagination: false,
    limit: 0,
  })
  const ids = new Set<number>()
  for (const job of docs) {
    const sourceId = (job.input as { sourceId?: unknown } | null)?.sourceId
    if (typeof sourceId === 'number') ids.add(sourceId)
  }
  return ids
}

export interface EnqueueResult {
  enqueued: number
  /** `scraping-settings.isEnabled = false` bo'lsa. */
  disabled: boolean
}

export async function enqueueDueFeedPolls(
  payload: Payload,
  options: { now?: number; settings?: JobsSettings } = {},
): Promise<EnqueueResult> {
  const settings = options.settings ?? (await getJobsSettings(payload))
  if (!settings.isEnabled) return { enqueued: 0, disabled: true }

  const now = options.now ?? Date.now()
  const [{ docs: sources }, busy] = await Promise.all([
    payload.find({
      collection: 'sources',
      where: { isActive: { equals: true } },
      select: { feeds: true, pollIntervalMin: true },
      depth: 0,
      pagination: false,
      limit: 0,
    }),
    sourcesWithPendingPoll(payload),
  ])

  let enqueued = 0
  for (const source of sources) {
    if (busy.has(source.id)) continue
    const interval = source.pollIntervalMin ?? settings.defaultPollIntervalMin
    if (!(source.feeds ?? []).some((feed) => isFeedDue(feed, interval, now))) continue
    await payload.jobs.queue({ task: FEED_POLL_TASK, input: { sourceId: source.id } })
    enqueued++
  }
  return { enqueued, disabled: false }
}

/**
 * `maintenance.cleanup` ni kuniga bir marta navbatga qo'yadi (Toshkent kuni bo'yicha — kunning
 * birinchi scheduler chaqiruvida). pg_cron har 10 daqiqada chaqirsa ham idempotent:
 * - tugallanmagan cleanup job'i bo'lsa — yangisi qo'yilmaydi;
 * - `stats.cleanup.enqueuedDate` atomar "band qilinadi" (`claimDailyCleanup`): parallel
 *   chaqiruvlardan faqat bittasi navbatga qo'yadi; 3 retry'dan keyin ham xato bo'lsa — ertaga.
 * `scraping-settings.isEnabled` ga bog'liq emas (tozalash va hajm o'lchovi kvota uchun kerak).
 */
export async function enqueueDailyCleanup(payload: Payload, now = Date.now()): Promise<boolean> {
  const { totalDocs } = await payload.count({
    collection: 'payload-jobs',
    where: { and: [{ taskSlug: { equals: MAINTENANCE_CLEANUP_TASK } }, ...unfinished] },
  })
  if (totalDocs > 0) return false
  const date = localDate(new Date(now))
  if (!(await claimDailyCleanup(payload, date))) return false
  await payload.jobs.queue({ task: MAINTENANCE_CLEANUP_TASK, input: { date } })
  return true
}

/**
 * Function timeout yoki jarayon uzilishi sababli `processing: true` holatida qolib ketgan
 * job'larni qayta navbatga qaytaradi (aks holda ular abadiy "band" bo'lib qoladi).
 *
 * Bitta `UPDATE` (OBLOG-33): Payload'ning bulk `payload.update` i har hujjatni bitta
 * tranzaksiya ulanishida **parallel** yangilaydi (`Promise.all(docs.map(processDocument))`) —
 * pg `DeprecationWarning: Calling client.query() when the client is already executing a query`
 * va har job uchun bir necha so'rov (region'lar farq qilsa har biri ~200 ms). Job'larda hook
 * yo'q (`jobs.runHooks` o'chiq), shuning uchun xom SQL yetarli.
 */
export async function releaseStaleJobs(payload: Payload, now = Date.now()): Promise<number> {
  const staleBefore = new Date(now - STALE_JOB_MS).toISOString()
  const result = (await (payload.db as unknown as PostgresAdapter).drizzle.execute(sql`
    UPDATE "payload_jobs"
    SET "processing" = false, "updated_at" = ${new Date(now).toISOString()}::timestamptz
    WHERE "processing" = true AND "updated_at" < ${staleBefore}::timestamptz
    RETURNING "id"
  `)) as unknown as { rows: { id: number }[] }
  return result.rows.length
}

/** Berilgan navbatlardagi hali bajarilmagan (retry kutayotganlari ham) job'lar soni. */
export async function countRemainingJobs(payload: Payload, queues: readonly string[]) {
  const { totalDocs } = await payload.count({
    collection: 'payload-jobs',
    where: { and: [{ queue: { in: [...queues] } }, ...unfinished] },
  })
  return totalDocs
}
