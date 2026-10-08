import { createHash, timingSafeEqual } from 'node:crypto'

import type { Payload, Where } from 'payload'

import { runWithAuditChannel } from '@/audit/channel'
import { captureError, flushSentry } from '@/lib/sentry'
import { TELEGRAM_TIMEOUT_MS } from '@/lib/telegram'

import { type AlertRunResult, runAlertChecks } from './alerts'
import {
  BATCH_START_LIMIT_MS,
  DEFAULT_QUEUE,
  JOBS_RUN_MODES,
  type JobsRunMode,
  MAX_BATCH_LIMIT,
  MAX_DEADLINE_SEC,
  PUBLISH_BATCH_LIMIT,
  PUBLISH_TASKS,
  RESPONSE_BUDGET_MS,
  TASK_GRACE_MS,
} from './constants'
import { runWithDeadline } from './context'
import { type NewItemsNotifyResult, runNewItemsNotification } from './newItemsNotify'
import { activeRunQueues } from './scrapeDeps'
import {
  countRemainingJobs,
  enqueueDailyCleanup,
  enqueueDueFeedPolls,
  releaseStaleJobs,
} from './scheduler'
import { ensureScheduledPublishJobs, type EnsureScheduledResult } from './scheduledPublish'
import { getJobsSettings } from './settings'

/**
 * Job'larni vaqt chegarasi bilan ishga tushirish (TZ §3.5, §3.7.2).
 *
 * `payload.jobs.run({ limit })` batch'lari ketma-ket chaqiriladi (batch ichida `limit` ta job
 * parallel — `scraping-settings.jobsBatchLimit`): navbat bo'shaguncha yoki ichki deadline'gacha.
 * Deadline `startedAt` dan (so'rov boshidan) hisoblanadi — pre-step'lar sarflagan vaqt ham
 * byudjetga kiradi. Deadline'dan keyin yangi batch boshlanmaydi, boshlangan task'lar esa
 * `taskDeadlineAt` (= deadline + grace) ichida tugaydi.
 *
 * Ikki bosqich (OBLOG-110): avval **nashr** (`runPublishJobs` — ketma-ket, faqat nashr task'lari),
 * keyin **scraping** (`jobsBatchLimit` ta parallel, nashrdan boshqa hamma job'lar). Qaysi bosqich
 * ishlashi — `?mode=publish|scrape|all` (pg_cron: nashr har 10, scraping har 30 daqiqada).
 */

type JobsRun = Pick<Payload['jobs'], 'run'>

export interface RunWithDeadlineOptions {
  /** Bitta `payload.jobs.run` chaqiruvidagi maksimal (parallel) job'lar soni. */
  limit: number
  /** Yangi batch boshlanmaydigan vaqt (`startedAt` dan, ms). */
  deadlineMs: number
  /** Byudjet boshlanishi (epoch ms) — odatda so'rov kelgan vaqt; default — hozir. */
  startedAt?: number
  /** Deadline'dan keyin boshlangan task'lar tugashi uchun qo'shimcha vaqt (ms). */
  graceMs?: number
  queues?: readonly string[]
  /** Qo'shimcha filtr (masalan, faqat nashr task'lari — OBLOG-110). */
  where?: Where
  /** Batch ichidagi job'lar ketma-ket (parallel emas). */
  sequential?: boolean
  now?: () => number
}

/** Nashr task'lari ({@link PUBLISH_TASKS}) — `mode=publish` bosqichi. */
export const PUBLISH_WHERE: Where = { taskSlug: { in: [...PUBLISH_TASKS] } }
/**
 * Nashrdan boshqa hamma job'lar — `mode=scrape` bosqichi. Workflow job'larida (`scrapeItem`)
 * `taskSlug` yo'q (NULL) — `not_in` ularni chiqarib tashlamasligi uchun alohida shart.
 */
export const NON_PUBLISH_WHERE: Where = {
  or: [{ taskSlug: { not_in: [...PUBLISH_TASKS] } }, { taskSlug: { exists: false } }],
}

/** `?mode=` qiymati; berilmagan — `all`, noto'g'ri — `null` (400). */
export function parseRunMode(value: string | null): JobsRunMode | null {
  if (value === null || value === '') return 'all'
  return (JOBS_RUN_MODES as readonly string[]).includes(value) ? (value as JobsRunMode) : null
}

/**
 * Nashr bosqichi (OBLOG-110): `default` navbatidagi muddati kelgan `schedulePublish` va undan
 * keyingi `telegram.post` / `make.webhook` / `indexnow.submit` job'lari — **ketma-ket**, kichik
 * batch'larda ({@link PUBLISH_BATCH_LIMIT}). Publish hook'lari qo'ygan Telegram/Make/IndexNow
 * job'lari shu siklning keyingi batch'ida bajariladi (`after()` runner ichida ishlatilmaydi).
 * Scraping job'lari bu bosqichda olinmaydi — ular nashrni kechiktira olmaydi.
 */
export function runPublishJobs(
  jobs: JobsRun,
  options: Omit<RunWithDeadlineOptions, 'limit' | 'queues' | 'where' | 'sequential'>,
): Promise<RunWithDeadlineResult> {
  return runJobsWithDeadline(jobs, {
    ...options,
    queues: [DEFAULT_QUEUE],
    where: PUBLISH_WHERE,
    limit: PUBLISH_BATCH_LIMIT,
    sequential: true,
  })
}

export interface RunWithDeadlineResult {
  batches: number
  succeeded: number
  failed: number
  deadlineReached: boolean
}

export async function runJobsWithDeadline(
  jobs: JobsRun,
  options: RunWithDeadlineOptions,
): Promise<RunWithDeadlineResult> {
  const now = options.now ?? Date.now
  const queues = options.queues ?? activeRunQueues()
  const deadlineAt = (options.startedAt ?? now()) + options.deadlineMs
  const taskDeadlineAt = deadlineAt + (options.graceMs ?? TASK_GRACE_MS)
  const result: RunWithDeadlineResult = {
    batches: 0,
    succeeded: 0,
    failed: 0,
    deadlineReached: false,
  }

  for (;;) {
    let processed = 0
    for (const queue of queues) {
      if (now() >= deadlineAt) {
        result.deadlineReached = true
        return result
      }
      const run = await runWithDeadline({ taskDeadlineAt }, () =>
        jobs.run({
          queue,
          limit: options.limit,
          ...(options.where ? { where: options.where } : {}),
          ...(options.sequential ? { sequential: true } : {}),
        }),
      )
      const statuses = Object.values(run.jobStatus ?? {})
      if (!statuses.length) continue
      result.batches++
      processed += statuses.length
      for (const { status } of statuses) {
        if (status === 'success') result.succeeded++
        else result.failed++
      }
    }
    // Hech bir navbatda bajariladigan job qolmadi (retry kutayotganlari `waitUntil` bilan).
    if (processed === 0) return result
  }
}

/** `Authorization: Bearer <JOBS_SECRET>` — vaqt bo'yicha barqaror (timing-safe) taqqoslash. */
export function isAuthorized(header: string | null, secret: string): boolean {
  const match = header?.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(match[1].trim()), digest(secret))
}

/**
 * Ogohlantirishlar job'lardan keyin tekshiriladi — faqat chaqiruv boshidan shu vaqtgacha
 * (`RESPONSE_BUDGET_MS`; Vercel function limiti 60 s). Vaqt qolmasa, keyingi scraping
 * chaqiruvida (30 daqiqadan keyin). `mode=publish` da tekshirilmaydi.
 */
export const ALERTS_HARD_LIMIT_MS = RESPONSE_BUDGET_MS

/** Pre-step'lar deadline'ni yeb qo'ysa o'tkazib yuboriladigan qadamlar (keyingi tick'da). */
export type SkippedStep = 'scheduledPublish' | 'feedPolls' | 'cleanup' | 'alerts' | 'newItems'

export interface JobsRunResponse {
  ok: true
  /** `?mode=`: `publish` (har 10 daqiqa), `scrape` (har 30 daqiqa) yoki `all`. */
  mode: JobsRunMode
  enqueued: number
  /** Shu chaqiruvda `maintenance.cleanup` navbatga qo'yildimi (kuniga 1 marta). */
  cleanupEnqueued: boolean
  /**
   * Rejalashtirilgan postlar (OBLOG-100): job'i yo'qolgan/xato bergan postlar uchun qayta
   * navbatga qo'yilganlar va urinishlari tugaganlar; vaqt yetmasa — null.
   */
  scheduledPublish: EnsureScheduledResult | null
  /** Ogohlantirishlar: faol shartlar / yuborilgan / faqat log / xato; vaqt yetmasa — null. */
  alerts: AlertRunResult | null
  /** "Yangi yangiliklar" xabari (OBLOG-55); vaqt yetmasa — null (keyingi tick'da yig'iladi). */
  newItems: NewItemsNotifyResult | null
  scrapingDisabled: boolean
  releasedStale: number
  batches: number
  /** Bajarilgan job'lar: muvaffaqiyatli / xato bilan (ikkala bosqich yig'indisi). */
  done: { succeeded: number; failed: number }
  /** Bosqichlar alohida: nashr (ketma-ket) va scraping; rejimga kirmagan bosqich — null. */
  phases: { publish: RunWithDeadlineResult | null; scrape: RunWithDeadlineResult | null }
  /** Shu rejim navbatlarida qolgan (retry kutayotganlari bilan) job'lar. */
  remaining: number
  deadlineReached: boolean
  /** Vaqt yetmagani uchun bu chaqiruvda bajarilmagan qadamlar. */
  skipped: SkippedStep[]
  /** Bitta batch'dagi (parallel) job'lar soni: `jobsBatchLimit` yoki `?limit=` (≤ 50). */
  limit: number
  /** Amaldagi ichki deadline (so'rov boshidan, s): `min(jobsDeadlineSec, 35)`. */
  deadlineSec: number
  durationMs: number
}

export interface HandleJobsRunDeps {
  getPayload: () => Promise<Payload>
  secret: string | undefined
  /** Testlar uchun: deadline/grace'ni qisqartirish. */
  overrides?: { deadlineMs?: number; graceMs?: number }
  /** Testlar uchun soat (so'rov boshi va barcha chegaralar shu bilan o'lchanadi). */
  now?: () => number
}

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  })
}

/**
 * `POST /api/jobs/run` (pg_cron + pg_net; zaxira — GitHub Actions).
 * - `?mode=publish` — har 10 daqiqada: faqat nashr (rejalashtirilgan postlar, Telegram, Make,
 *   IndexNow); `?mode=scrape` — har 30 daqiqada: yangiliklar va xizmat ishlari; parametrsiz
 *   (`all`) — ikkalasi, avval nashr (OBLOG-110, `infra/supabase/cron.sql`).
 * - `?limit=N` — scraping batch hajmini vaqtincha o'zgartirish (1–50), default `scraping-settings`.
 *   Nashr bosqichiga ta'sir qilmaydi (u doim ketma-ket, {@link PUBLISH_BATCH_LIMIT}).
 */
export async function handleJobsRunRequest(
  request: Request,
  deps: HandleJobsRunDeps,
): Promise<Response> {
  // Byudjet shu yerdan: Payload init (sovuq start'da DB ulanishi) ham unga kiradi.
  const startedAt = (deps.now ?? Date.now)()
  if (!deps.secret) {
    return json({ ok: false, error: 'JOBS_SECRET sozlanmagan — endpoint yopiq' }, 503)
  }
  if (!isAuthorized(request.headers.get('authorization'), deps.secret)) {
    return json({ ok: false, error: 'Unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' })
  }

  const mode = parseRunMode(new URL(request.url).searchParams.get('mode'))
  if (!mode) {
    return json({ ok: false, error: `mode: ${JOBS_RUN_MODES.join(' | ')} bo‘lishi kerak` }, 400)
  }

  const payload = await deps.getPayload()
  // Ichidagi barcha yozuvlar (Payload'ning `schedulePublish` task'i ham) audit'da `channel: job`.
  return runWithAuditChannel('job', () => runJobsRequest(request, payload, deps, startedAt, mode))
}

/** Ikki bosqich natijasining yig'indisi (javobdagi umumiy `batches`/`done`/`deadlineReached`). */
function sumRuns(...runs: (RunWithDeadlineResult | null)[]): RunWithDeadlineResult {
  const total: RunWithDeadlineResult = {
    batches: 0,
    succeeded: 0,
    failed: 0,
    deadlineReached: false,
  }
  for (const run of runs) {
    if (!run) continue
    total.batches += run.batches
    total.succeeded += run.succeeded
    total.failed += run.failed
    total.deadlineReached ||= run.deadlineReached
  }
  return total
}

async function runJobsRequest(
  request: Request,
  payload: Payload,
  deps: HandleJobsRunDeps,
  startedAt: number,
  mode: JobsRunMode,
): Promise<Response> {
  const now = deps.now ?? Date.now
  try {
    const settings = await getJobsSettings(payload)
    const limitParam = Number(new URL(request.url).searchParams.get('limit'))
    const limit =
      Number.isInteger(limitParam) && limitParam > 0
        ? Math.min(limitParam, MAX_BATCH_LIMIT)
        : settings.batchLimit
    const deadlineMs =
      deps.overrides?.deadlineMs ??
      Math.min(Math.min(settings.deadlineSec, MAX_DEADLINE_SEC) * 1000, BATCH_START_LIMIT_MS)
    // Yangi batch'lar shu vaqtgacha (so'rov boshidan) — pre-step'lar ham shu byudjetdan.
    const batchDeadlineAt = startedAt + deadlineMs
    const skipped: SkippedStep[] = []

    const publishing = mode !== 'scrape'
    const scraping = mode !== 'publish'
    const timing = { startedAt, deadlineMs, graceMs: deps.overrides?.graceMs, now }

    // Bitta UPDATE — har doim (aks holda uzilgan job'lar navbatni to'sib turadi).
    const releasedStale = await releaseStaleJobs(payload)

    // 1-bosqich — nashr (OBLOG-110): scraping'dan oldin, ketma-ket. Rejalashtirilgan postlar:
    // job'i yo'q/xato bergan bo'lsa — shu chaqiruvda bajarilishi uchun batch'dan oldin qo'yiladi.
    let scheduledPublish: EnsureScheduledResult | null = null
    let publish: RunWithDeadlineResult | null = null
    if (publishing) {
      if (now() < batchDeadlineAt) {
        scheduledPublish = await ensureScheduledPublishJobs(payload, now())
      } else skipped.push('scheduledPublish')
      publish = await runPublishJobs(payload.jobs, timing)
    }

    // 2-bosqich — scraping. Deadline pre-step'larda o'tib ketgan bo'lsa (sekin sovuq start),
    // navbatga qo'yish keyingi tick'ga qoldiriladi: bu chaqiruvda baribir bajarib bo'lmaydi.
    const queues = activeRunQueues()
    let polls: Awaited<ReturnType<typeof enqueueDueFeedPolls>> | null = null
    let cleanupEnqueued = false
    let scrape: RunWithDeadlineResult | null = null
    if (scraping) {
      if (now() < batchDeadlineAt) polls = await enqueueDueFeedPolls(payload, { settings })
      else skipped.push('feedPolls')
      if (now() < batchDeadlineAt) cleanupEnqueued = await enqueueDailyCleanup(payload)
      else skipped.push('cleanup')
      scrape = await runJobsWithDeadline(payload.jobs, {
        ...timing,
        queues,
        limit,
        // `all` da nashr job'lari 1-bosqichda bajarildi; `scrape` ularga tegmaydi (har 10 daqiqalik
        // `mode=publish` oladi) — parallel batch'da publish bo'lmasin.
        where: NON_PUBLISH_WHERE,
      })
    }

    const run = sumRuns(publish, scrape)
    const remaining = await countRemainingJobs(
      payload,
      scraping ? queues : [DEFAULT_QUEUE],
      mode === 'all' ? undefined : scraping ? NON_PUBLISH_WHERE : PUBLISH_WHERE,
    )
    // Ogohlantirishlar va "yangi yangiliklar" — scraping bilan bog'liq: faqat `scrape`/`all`.
    let alerts: AlertRunResult | null = null
    let newItems: NewItemsNotifyResult | null = null
    if (scraping) {
      const timeLeft = ALERTS_HARD_LIMIT_MS - (now() - startedAt)
      if (timeLeft >= 1_000) {
        alerts = await runAlertChecks(payload, {
          timeoutMs: Math.min(TELEGRAM_TIMEOUT_MS, timeLeft),
        })
      } else skipped.push('alerts')
      // Tick'da bitta xabar: barcha `feed.poll` job'laridan keyin (OBLOG-55).
      const notifyTimeLeft = ALERTS_HARD_LIMIT_MS - (now() - startedAt)
      if (notifyTimeLeft >= 1_000) {
        newItems = await runNewItemsNotification(payload, {
          timeoutMs: Math.min(TELEGRAM_TIMEOUT_MS, notifyTimeLeft),
        })
      } else skipped.push('newItems')
    }

    const body: JobsRunResponse = {
      ok: true,
      mode,
      enqueued: polls?.enqueued ?? 0,
      cleanupEnqueued,
      scheduledPublish,
      alerts,
      newItems,
      scrapingDisabled: polls?.disabled ?? !settings.isEnabled,
      releasedStale,
      batches: run.batches,
      done: { succeeded: run.succeeded, failed: run.failed },
      phases: { publish, scrape },
      remaining,
      deadlineReached: run.deadlineReached,
      skipped,
      limit,
      deadlineSec: Math.round(deadlineMs / 1000),
      durationMs: now() - startedAt,
    }
    payload.logger.info({ msg: 'jobs/run', ...body })
    // Task xatolari (`jobs/sentry.ts`) javobdan oldin yuborib olinadi (serverless muzlatish).
    if (run.failed > 0) await flushSentry()
    return json(body, 200)
  } catch (error) {
    payload.logger.error({ err: error, msg: 'jobs/run xatosi' })
    captureError(error, { tags: { endpoint: 'jobs/run' } })
    await flushSentry()
    return json({ ok: false, error: 'Internal error', durationMs: now() - startedAt }, 500)
  }
}
