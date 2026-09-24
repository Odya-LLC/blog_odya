import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { env } from '@/env'
import { escapeTelegramHtml, sendTelegramMessage, TELEGRAM_TIMEOUT_MS } from '@/lib/telegram'

import { ALERT_THRESHOLDS, ALERT_THROTTLE_MS } from './constants'
import {
  type AlertStateEntry,
  mergeScrapingStats,
  readScrapingStats,
  type ScrapingStats,
} from './stats'

/**
 * Admin ogohlantirishlari (TZ §3.5 "Ishonchlilik", §3.7.2) — Telegram (`TELEGRAM_BOT_TOKEN` +
 * `telegram-settings.alertChatId` yoki `TELEGRAM_ALERT_CHAT_ID`); token/chat bo'lmasa — faqat log.
 *
 * Shartlar (`evaluateAlerts`, sof funksiya):
 * - manba feed'i ketma-ket ≥ 3 marta xato (`sources.stats.consecutiveFailures`, `feed.poll`);
 * - manbaning 24 soatlik yig'ish muvaffaqiyati < 80% (yakunlangan elementlar: `error` —
 *   muvaffaqiyatsiz; kamida 5 ta element bo'lsa);
 * - DB ≥ 70% (350 MB / 500 MB) va R2 ≥ 8 GB — `maintenance.cleanup` o'lchovi (`stats.db/r2`).
 *
 * Takrorlanmaslik (`planAlerts`): har bir shart kaliti bo'yicha `stats.alerts[key].sentAt`;
 * shart saqlanib qolsa — 24 soatda bir marta eslatma, yo'qolsa — kalit o'chiriladi (keyingi
 * safar darhol yuboriladi). Tekshiruv har `/api/jobs/run` chaqiruvida (har 10 daqiqa) — arzon
 * (2 ta so'rov), Telegram faqat yangi/eslatma shartlarda chaqiriladi.
 */

export interface SourceAlertInfo {
  id: number
  name: string
  consecutiveFailures: number
  lastError?: string | null
}

export interface SourceItemStats {
  id: number
  name: string
  /** 24 soatda yakunlangan (`pending` emas) elementlar. */
  finished: number
  failed: number
}

export interface AlertSnapshot {
  sources: SourceAlertInfo[]
  items: SourceItemStats[]
  dbBytes?: number | null
  r2Bytes?: number | null
}

export interface AlertCondition {
  key: string
  message: string
}

export type AlertThresholds = typeof ALERT_THRESHOLDS

const MB = 1024 * 1024
const GB = 1024 * MB

function formatBytes(bytes: number): string {
  return bytes >= GB ? `${(bytes / GB).toFixed(2)} GB` : `${Math.round(bytes / MB)} MB`
}

export function evaluateAlerts(
  snapshot: AlertSnapshot,
  thresholds: AlertThresholds = ALERT_THRESHOLDS,
): AlertCondition[] {
  const conditions: AlertCondition[] = []
  for (const source of snapshot.sources) {
    if (source.consecutiveFailures >= thresholds.consecutiveFailures) {
      conditions.push({
        key: `source-failing:${source.id}`,
        message:
          `«${source.name}» manbasi ketma-ket ${source.consecutiveFailures} marta xato berdi` +
          (source.lastError ? `.\nOxirgi xato: ${source.lastError.slice(0, 300)}` : '.'),
      })
    }
  }
  for (const stats of snapshot.items) {
    if (stats.finished < thresholds.minSampleSize) continue
    const rate = (stats.finished - stats.failed) / stats.finished
    if (rate < thresholds.minSuccessRate) {
      conditions.push({
        key: `source-success-rate:${stats.id}`,
        message:
          `«${stats.name}»: oxirgi 24 soatda yig'ish muvaffaqiyati ${Math.round(rate * 100)}% ` +
          `(${stats.finished - stats.failed}/${stats.finished}), chegara ${Math.round(thresholds.minSuccessRate * 100)}%.`,
      })
    }
  }
  const dbWarn = thresholds.dbLimitBytes * thresholds.dbWarnRatio
  if (typeof snapshot.dbBytes === 'number' && snapshot.dbBytes >= dbWarn) {
    conditions.push({
      key: 'db-size',
      message:
        `DB hajmi ${formatBytes(snapshot.dbBytes)} — bepul limitning ` +
        `${Math.round((snapshot.dbBytes / thresholds.dbLimitBytes) * 100)}% ` +
        `(chegara ${formatBytes(dbWarn)} / ${formatBytes(thresholds.dbLimitBytes)}).`,
    })
  }
  if (typeof snapshot.r2Bytes === 'number' && snapshot.r2Bytes >= thresholds.r2WarnBytes) {
    conditions.push({
      key: 'r2-size',
      message: `R2 hajmi ${formatBytes(snapshot.r2Bytes)} (chegara ${formatBytes(thresholds.r2WarnBytes)}, bepul kvota 10 GB).`,
    })
  }
  return conditions
}

export interface AlertPlan {
  send: AlertCondition[]
  /** Holati hal bo'lgan (endi shart bajarilmaydigan) kalitlar. */
  resolved: string[]
}

export function planAlerts(
  conditions: readonly AlertCondition[],
  state: Record<string, AlertStateEntry> | null | undefined,
  now: number,
  throttleMs: number = ALERT_THROTTLE_MS,
): AlertPlan {
  const current = state ?? {}
  const active = new Set(conditions.map((c) => c.key))
  const send = conditions.filter((condition) => {
    const sentAt = Date.parse(current[condition.key]?.sentAt ?? '')
    return Number.isNaN(sentAt) || now - sentAt >= throttleMs
  })
  const resolved = Object.keys(current).filter((key) => !active.has(key))
  return { send, resolved }
}

type Rows<T> = { rows: T[] }

function drizzle(payload: Payload) {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

export async function collectAlertSnapshot(
  payload: Payload,
  options: { now: number; stats: ScrapingStats },
): Promise<AlertSnapshot> {
  const { docs } = await payload.find({
    collection: 'sources',
    where: { isActive: { equals: true } },
    select: { name: true, stats: true },
    depth: 0,
    pagination: false,
    limit: 0,
  })
  const names = new Map(docs.map((source) => [source.id, source.name]))
  const since = new Date(options.now - 24 * 60 * 60_000).toISOString()
  const { rows } = (await drizzle(payload).execute(sql`
    SELECT "source_id" AS "id",
      count(*) FILTER (WHERE "status" <> 'pending')::int AS "finished",
      count(*) FILTER (WHERE "status" = 'error')::int AS "failed"
    FROM "scraped_items"
    WHERE "created_at" >= ${since}::timestamptz AND "source_id" IS NOT NULL
    GROUP BY "source_id"
  `)) as unknown as Rows<{ id: number; finished: number; failed: number }>

  const r2 = options.stats.r2
  return {
    sources: docs.map((source) => {
      const stats = (source.stats ?? {}) as { consecutiveFailures?: unknown; lastError?: unknown }
      return {
        id: source.id,
        name: source.name,
        consecutiveFailures: Number(stats.consecutiveFailures ?? 0) || 0,
        lastError: typeof stats.lastError === 'string' ? stats.lastError : null,
      }
    }),
    items: rows
      .filter((row) => names.has(row.id))
      .map((row) => ({
        id: row.id,
        name: names.get(row.id)!,
        finished: Number(row.finished),
        failed: Number(row.failed),
      })),
    dbBytes: options.stats.db?.bytes ?? null,
    r2Bytes: r2 && !r2.error ? r2.bytes : null,
  }
}

export interface AlertDeps {
  now: () => number
  fetchImpl?: typeof fetch
  /** Testlar uchun: `undefined` — env/global'dan. */
  telegram?: { token?: string; chatId?: string }
}

export const alertDeps: AlertDeps = { now: () => Date.now() }

async function resolveTelegramTarget(payload: Payload, deps: AlertDeps) {
  if (deps.telegram) return deps.telegram
  let chatId = env.TELEGRAM_ALERT_CHAT_ID
  try {
    const settings = await payload.findGlobal({ slug: 'telegram-settings', depth: 0 })
    chatId = settings.alertChatId?.trim() || chatId
  } catch {
    // Global o'qilmasa — env qiymati.
  }
  return { token: env.TELEGRAM_BOT_TOKEN, chatId }
}

export interface AlertRunResult {
  active: number
  sent: number
  logged: number
  failed: number
}

/**
 * Shartlarni tekshiradi va kerak bo'lsa yuboradi. Hech qachon otilmaydi (endpoint'ni
 * yiqitmaydi) — xatolar log'ga yoziladi. `timeoutMs` — Telegram so'rovi uchun (endpoint
 * qolgan vaqti).
 */
export async function runAlertChecks(
  payload: Payload,
  options: { timeoutMs?: number; deps?: AlertDeps } = {},
): Promise<AlertRunResult> {
  const deps = options.deps ?? alertDeps
  const result: AlertRunResult = { active: 0, sent: 0, logged: 0, failed: 0 }
  try {
    const now = deps.now()
    const stats = await readScrapingStats(payload)
    const conditions = evaluateAlerts(await collectAlertSnapshot(payload, { now, stats }))
    result.active = conditions.length
    const plan = planAlerts(conditions, stats.alerts, now)
    if (!plan.send.length && !plan.resolved.length) return result

    const target = plan.send.length ? await resolveTelegramTarget(payload, deps) : {}
    const next: Record<string, AlertStateEntry> = { ...stats.alerts }
    for (const key of plan.resolved) delete next[key]

    for (const condition of plan.send) {
      const sentAt = new Date(now).toISOString()
      if (!target.token || !target.chatId) {
        payload.logger.warn({ msg: `ALERT: ${condition.message}`, alert: condition.key })
        next[condition.key] = { sentAt, via: 'log', message: condition.message }
        result.logged++
        continue
      }
      try {
        await sendTelegramMessage({
          token: target.token,
          chatId: target.chatId,
          text: `<b>Blog Odya — ogohlantirish</b>\n${escapeTelegramHtml(condition.message)}`,
          timeoutMs: Math.min(options.timeoutMs ?? TELEGRAM_TIMEOUT_MS, TELEGRAM_TIMEOUT_MS),
          fetchImpl: deps.fetchImpl,
        })
        next[condition.key] = { sentAt, via: 'telegram', message: condition.message }
        result.sent++
      } catch (error) {
        // Belgilanmaydi — keyingi chaqiruvda qayta uriniladi.
        result.failed++
        payload.logger.error({
          msg: `ALERT (Telegram yuborilmadi): ${condition.message}`,
          alert: condition.key,
          error: (error as Error).message,
        })
      }
    }
    await mergeScrapingStats(payload, { alerts: next })
  } catch (error) {
    payload.logger.error({ err: error, msg: 'Ogohlantirishlarni tekshirib bo‘lmadi' })
  }
  return result
}
