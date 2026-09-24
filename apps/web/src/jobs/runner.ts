import { createHash, timingSafeEqual } from 'node:crypto'

import type { Payload } from 'payload'

import { runWithAuditChannel } from '@/audit/channel'
import { TELEGRAM_TIMEOUT_MS } from '@/lib/telegram'

import { type AlertRunResult, runAlertChecks } from './alerts'
import {
  BATCH_START_LIMIT_MS,
  MAX_BATCH_LIMIT,
  MAX_DEADLINE_SEC,
  RESPONSE_BUDGET_MS,
  TASK_GRACE_MS,
} from './constants'
import { runWithDeadline } from './context'
import { activeRunQueues } from './scrapeDeps'
import {
  countRemainingJobs,
  enqueueDailyCleanup,
  enqueueDueFeedPolls,
  releaseStaleJobs,
} from './scheduler'
import { getJobsSettings } from './settings'

/**
 * Job'larni vaqt chegarasi bilan ishga tushirish (TZ §3.5, §3.7.2).
 *
 * `payload.jobs.run({ limit })` batch'lari ketma-ket chaqiriladi (batch ichida `limit` ta job
 * parallel — `scraping-settings.jobsBatchLimit`): navbat bo'shaguncha yoki ichki deadline'gacha.
 * Deadline `startedAt` dan (so'rov boshidan) hisoblanadi — pre-step'lar sarflagan vaqt ham
 * byudjetga kiradi. Deadline'dan keyin yangi batch boshlanmaydi, boshlangan task'lar esa
 * `taskDeadlineAt` (= deadline + grace) ichida tugaydi.
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
  now?: () => number
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
        jobs.run({ queue, limit: options.limit }),
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
 * (`RESPONSE_BUDGET_MS`; Vercel function limiti 60 s). Vaqt qolmasa, keyingi chaqiruvda
 * (10 daqiqadan keyin).
 */
export const ALERTS_HARD_LIMIT_MS = RESPONSE_BUDGET_MS

/** Pre-step'lar deadline'ni yeb qo'ysa o'tkazib yuboriladigan qadamlar (keyingi tick'da). */
export type SkippedStep = 'feedPolls' | 'cleanup' | 'alerts'

export interface JobsRunResponse {
  ok: true
  enqueued: number
  /** Shu chaqiruvda `maintenance.cleanup` navbatga qo'yildimi (kuniga 1 marta). */
  cleanupEnqueued: boolean
  /** Ogohlantirishlar: faol shartlar / yuborilgan / faqat log / xato; vaqt yetmasa — null. */
  alerts: AlertRunResult | null
  scrapingDisabled: boolean
  releasedStale: number
  batches: number
  /** Bajarilgan job'lar: muvaffaqiyatli / xato bilan. */
  done: { succeeded: number; failed: number }
  /** Navbatda qolgan (retry kutayotganlari bilan) job'lar. */
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
 * `POST /api/jobs/run` (pg_cron + pg_net har 10 daqiqada; zaxira — GitHub Actions).
 * `?limit=N` — batch hajmini vaqtincha o'zgartirish (1–50), default `scraping-settings`.
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

  const payload = await deps.getPayload()
  // Ichidagi barcha yozuvlar (Payload'ning `schedulePublish` task'i ham) audit'da `channel: job`.
  return runWithAuditChannel('job', () => runJobsRequest(request, payload, deps, startedAt))
}

async function runJobsRequest(
  request: Request,
  payload: Payload,
  deps: HandleJobsRunDeps,
  startedAt: number,
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

    // Bitta UPDATE — har doim (aks holda uzilgan job'lar navbatni to'sib turadi).
    const releasedStale = await releaseStaleJobs(payload)
    // Deadline pre-step'larning o'zida o'tib ketgan bo'lsa (sekin sovuq start), navbatga qo'yish
    // keyingi tick'ga qoldiriladi: bu chaqiruvda baribir bajarib bo'lmaydi.
    const polls = now() < batchDeadlineAt ? await enqueueDueFeedPolls(payload, { settings }) : null
    if (!polls) skipped.push('feedPolls')
    let cleanupEnqueued = false
    if (now() < batchDeadlineAt) cleanupEnqueued = await enqueueDailyCleanup(payload)
    else skipped.push('cleanup')

    const queues = activeRunQueues()
    const run = await runJobsWithDeadline(payload.jobs, {
      queues,
      limit,
      startedAt,
      deadlineMs,
      graceMs: deps.overrides?.graceMs,
      now,
    })
    const remaining = await countRemainingJobs(payload, queues)
    const timeLeft = ALERTS_HARD_LIMIT_MS - (now() - startedAt)
    let alerts: AlertRunResult | null = null
    if (timeLeft >= 1_000) {
      alerts = await runAlertChecks(payload, {
        timeoutMs: Math.min(TELEGRAM_TIMEOUT_MS, timeLeft),
      })
    } else skipped.push('alerts')

    const body: JobsRunResponse = {
      ok: true,
      enqueued: polls?.enqueued ?? 0,
      cleanupEnqueued,
      alerts,
      scrapingDisabled: polls?.disabled ?? !settings.isEnabled,
      releasedStale,
      batches: run.batches,
      done: { succeeded: run.succeeded, failed: run.failed },
      remaining,
      deadlineReached: run.deadlineReached,
      skipped,
      limit,
      deadlineSec: Math.round(deadlineMs / 1000),
      durationMs: now() - startedAt,
    }
    payload.logger.info({ msg: 'jobs/run', ...body })
    return json(body, 200)
  } catch (error) {
    payload.logger.error({ err: error, msg: 'jobs/run xatosi' })
    return json({ ok: false, error: 'Internal error', durationMs: now() - startedAt }, 500)
  }
}
