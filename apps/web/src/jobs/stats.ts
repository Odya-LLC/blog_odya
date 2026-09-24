import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * `scraping-settings.stats` (M2-03) — job'lar yozadigan xizmat ma'lumotlari:
 * - `db`, `r2` — `maintenance.cleanup` o'lchagan hajmlar (kuniga 1 marta);
 * - `cleanup` — oxirgi tozalash natijasi va kunlik navbat belgisi (`enqueuedDate`);
 * - `alerts` — yuborilgan ogohlantirishlar (qayta yubormaslik uchun, `src/jobs/alerts.ts`).
 *
 * Yozish — to'g'ridan-to'g'ri SQL: yuqori darajadagi kalitlar JSONB `||` bilan atomar
 * birlashtiriladi, shuning uchun parallel job'lar (cleanup ↔ alerts) bir-birining kalitini
 * eski qiymat bilan bosib ketmaydi.
 */

export interface DbSizeStats {
  bytes: number
  measuredAt: string
}

export interface R2SizeStats {
  bytes: number
  objects: number
  /** `false` — vaqt byudjeti tugadi, `bytes` — pastki chegara. */
  complete: boolean
  buckets: { name: string; bytes: number; objects: number; complete: boolean }[]
  measuredAt: string
  error?: string
}

export interface CleanupStats {
  /** Toshkent sanasi (YYYY-MM-DD) — shu kuni navbatga qo'yilgan (kuniga 1 marta). */
  enqueuedDate?: string
  lastRunAt?: string
  lastResult?: Record<string, unknown>
}

export interface AlertStateEntry {
  sentAt: string
  via: 'telegram' | 'log'
  message: string
}

export interface ScrapingStats {
  db?: DbSizeStats | null
  r2?: R2SizeStats | null
  cleanup?: CleanupStats | null
  alerts?: Record<string, AlertStateEntry> | null
}

function drizzle(payload: Payload) {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

export async function readScrapingStats(payload: Payload): Promise<ScrapingStats> {
  const global = await payload.findGlobal({ slug: 'scraping-settings', depth: 0 })
  const stats = (global as { stats?: unknown }).stats
  return stats && typeof stats === 'object' && !Array.isArray(stats) ? (stats as ScrapingStats) : {}
}

/** Global qatori hali yaratilmagan bo'lsa (yangi DB) — yaratadi. */
async function ensureSettingsRow(payload: Payload): Promise<void> {
  const result = (await drizzle(payload).execute(
    sql`SELECT "id" FROM "scraping_settings" LIMIT 1`,
  )) as unknown as { rows: unknown[] }
  if (!result.rows.length) await payload.updateGlobal({ slug: 'scraping-settings', data: {} })
}

/** `stats` ning yuqori darajadagi kalitlarini almashtiradi (qolganlari saqlanadi). */
export async function mergeScrapingStats(
  payload: Payload,
  patch: Partial<ScrapingStats>,
): Promise<void> {
  await ensureSettingsRow(payload)
  await drizzle(payload).execute(sql`
    UPDATE "scraping_settings"
    SET "stats" = (
      CASE WHEN jsonb_typeof("stats") = 'object' THEN "stats" ELSE '{}'::jsonb END
    ) || ${JSON.stringify(patch)}::jsonb
  `)
}

/**
 * Kunlik job'ni "band qilish": `stats.cleanup.enqueuedDate` `date` ga teng bo'lmasa, uni
 * atomar ravishda `date` ga o'rnatadi va `true` qaytaradi. Parallel chaqiruvlardan faqat bittasi
 * `true` oladi (bitta `UPDATE … WHERE … RETURNING` — qator qulfi bilan).
 */
export async function claimDailyCleanup(payload: Payload, date: string): Promise<boolean> {
  await ensureSettingsRow(payload)
  const result = (await drizzle(payload).execute(sql`
    UPDATE "scraping_settings"
    SET "stats" = jsonb_set(
      CASE WHEN jsonb_typeof("stats") = 'object' THEN "stats" ELSE '{}'::jsonb END,
      '{cleanup}',
      (
        CASE WHEN jsonb_typeof("stats"->'cleanup') = 'object'
          THEN "stats"->'cleanup' ELSE '{}'::jsonb END
      ) || jsonb_build_object('enqueuedDate', ${date}::text)
    )
    WHERE COALESCE("stats"->'cleanup'->>'enqueuedDate', '') <> ${date}
    RETURNING "id"
  `)) as unknown as { rows: unknown[] }
  return result.rows.length > 0
}
