import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { localDate } from '@/editorial/queue'

import {
  POPULAR_CANDIDATES,
  POPULAR_WINDOW_DAYS,
  type PopularRow,
  type PopularWindow,
} from './popular'

/**
 * Ko'rishlar jadvallari (OBLOG-69, migratsiya `oblog_69_post_views`) — to'g'ridan-to'g'ri SQL:
 * `post_views_daily (post_id, day, views)` — kunlik agregat (Toshkent sanasi),
 * `post_views_total (post_id, views, last_viewed_at)` — butun davr.
 *
 * Faqat ommaga ko'rinadigan postlar (chop etilgan va arxivlanmagan — `posts.read` qoidasi bilan
 * bir xil) hisoblanadi va reytingga kiradi.
 */

type Rows<T> = { rows: T[] }

/** Kunlik qatorlar shuncha kun saqlanadi (`maintenance.cleanup`); jami — doim. */
export const VIEWS_DAILY_RETENTION_DAYS = 90

const DAY_MS = 24 * 60 * 60_000

function drizzle(payload: Payload) {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

/** `date` (YYYY-MM-DD) dan `days` kun oldingi sana. */
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Bitta ko'rish: kunlik va jami hisoblagich bitta so'rovda (upsert). Post topilmasa yoki ommaga
 * ko'rinmasa — hech narsa yozilmaydi, `false`.
 */
export async function recordView(
  payload: Payload,
  postId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const day = localDate(now)
  const result = (await drizzle(payload).execute(sql`
    WITH target AS (
      SELECT "id" FROM "posts"
      WHERE "id" = ${postId}
        AND "_status" = 'published'
        AND "workflow_status" IS DISTINCT FROM 'archived'
    ), daily AS (
      INSERT INTO "post_views_daily" ("post_id", "day", "views")
      SELECT "id", ${day}::date, 1 FROM target
      ON CONFLICT ("post_id", "day") DO UPDATE SET "views" = "post_views_daily"."views" + 1
      RETURNING "post_id"
    )
    INSERT INTO "post_views_total" ("post_id", "views", "last_viewed_at")
    SELECT "post_id", 1, now() FROM daily
    ON CONFLICT ("post_id") DO UPDATE
      SET "views" = "post_views_total"."views" + 1, "last_viewed_at" = now()
    RETURNING "post_id"
  `)) as unknown as Rows<{ post_id: number }>
  return result.rows.length > 0
}

/**
 * Reyting nomzodlari: har oyna (7 kun, 30 kun, butun davr) bo'yicha eng ko'p ko'rilgan
 * `POPULAR_CANDIDATES` tadan. Tanlash — `pickPopular`.
 */
export async function loadPopularRows(
  payload: Payload,
  options: { now?: Date; limit?: number } = {},
): Promise<PopularRow[]> {
  const today = localDate(options.now ?? new Date())
  const weekFrom = shiftDate(today, POPULAR_WINDOW_DAYS.week - 1)
  const monthFrom = shiftDate(today, POPULAR_WINDOW_DAYS.month - 1)
  const limit = options.limit ?? POPULAR_CANDIDATES
  const result = (await drizzle(payload).execute(sql`
    WITH visible AS (
      SELECT t."post_id" AS "id", t."views" AS "total"
      FROM "post_views_total" t
      JOIN "posts" p ON p."id" = t."post_id"
      WHERE p."_status" = 'published' AND p."workflow_status" IS DISTINCT FROM 'archived'
    ), recent AS (
      SELECT d."post_id" AS "id",
        COALESCE(SUM(d."views") FILTER (WHERE d."day" >= ${weekFrom}::date), 0) AS "week",
        SUM(d."views") AS "month"
      FROM "post_views_daily" d
      WHERE d."day" >= ${monthFrom}::date
      GROUP BY d."post_id"
    ), stats AS (
      SELECT v."id", v."total", COALESCE(r."week", 0) AS "week", COALESCE(r."month", 0) AS "month"
      FROM visible v LEFT JOIN recent r ON r."id" = v."id"
    )
    (SELECT 'week' AS "window", "id", "week" AS "views", "total" FROM stats
      WHERE "week" > 0 ORDER BY "week" DESC, "total" DESC, "id" DESC LIMIT ${limit})
    UNION ALL
    (SELECT 'month' AS "window", "id", "month" AS "views", "total" FROM stats
      WHERE "month" > 0 ORDER BY "month" DESC, "total" DESC, "id" DESC LIMIT ${limit})
    UNION ALL
    (SELECT 'all' AS "window", "id", "total" AS "views", "total" FROM stats
      WHERE "total" > 0 ORDER BY "total" DESC, "id" DESC LIMIT ${limit})
  `)) as unknown as Rows<{
    window: PopularWindow
    id: number
    views: string | number
    total: string | number
  }>
  return result.rows.map((row) => ({
    window: row.window,
    id: Number(row.id),
    views: Number(row.views),
    total: Number(row.total),
  }))
}

/**
 * Demo/test ma'lumoti: kunlik qatorlar va jami (`views` yig'indisi) — mavjud qatorlarga tegmaydi
 * (`ON CONFLICT DO NOTHING`, qayta ishga tushirish xavfsiz). Yozilgan kunlik qatorlar soni.
 */
export async function insertViews(
  payload: Payload,
  entries: ReadonlyArray<{ postId: number; day: string; views: number }>,
): Promise<number> {
  if (entries.length === 0) return 0
  const db = drizzle(payload)
  let inserted = 0
  const totals = new Map<number, number>()
  for (const entry of entries) {
    const result = (await db.execute(sql`
      INSERT INTO "post_views_daily" ("post_id", "day", "views")
      VALUES (${entry.postId}, ${entry.day}::date, ${entry.views})
      ON CONFLICT DO NOTHING
      RETURNING "post_id"
    `)) as unknown as Rows<{ post_id: number }>
    inserted += result.rows.length
    totals.set(entry.postId, (totals.get(entry.postId) ?? 0) + entry.views)
  }
  for (const [postId, views] of totals) {
    await db.execute(sql`
      INSERT INTO "post_views_total" ("post_id", "views") VALUES (${postId}, ${views})
      ON CONFLICT DO NOTHING
    `)
  }
  return inserted
}

/**
 * Admin: postning butun davrdagi ko'rishlari. `req` — Payload operatsiyasi ichida (masalan,
 * `update` dan keyingi `afterRead`) tranzaksiya ulanishidan foydalanish uchun: aks holda kichik
 * pool'da (`RUNTIME_POOL_MAX`) ikkinchi ulanishni kutib qolish mumkin.
 */
export async function loadTotalViews(
  payload: Payload,
  postId: number,
  req?: Pick<PayloadRequest, 'transactionID'>,
): Promise<number> {
  const transactionID = req?.transactionID ? await req.transactionID : undefined
  const adapter = payload.db as unknown as PostgresAdapter
  const db =
    (transactionID !== undefined && adapter.sessions?.[transactionID]?.db) || adapter.drizzle
  const result = (await db.execute(
    sql`SELECT "views" FROM "post_views_total" WHERE "post_id" = ${postId}`,
  )) as unknown as Rows<{ views: string | number }>
  return Number(result.rows[0]?.views ?? 0)
}

/** Dashboard: bugungi (Toshkent sanasi) jami ko'rishlar. */
export async function loadViewsOnDay(payload: Payload, now: Date = new Date()): Promise<number> {
  const result = (await drizzle(payload).execute(
    sql`SELECT COALESCE(SUM("views"), 0) AS "views" FROM "post_views_daily" WHERE "day" = ${localDate(now)}::date`,
  )) as unknown as Rows<{ views: string | number }>
  return Number(result.rows[0]?.views ?? 0)
}

/** `maintenance.cleanup`: `retentionDays` kundan eski kunlik qatorlar (jami saqlanadi). */
export async function deleteOldDailyViews(
  payload: Payload,
  options: { now: number; retentionDays: number },
): Promise<number> {
  const cutoff = shiftDate(localDate(new Date(options.now)), options.retentionDays)
  const result = (await drizzle(payload).execute(sql`
    DELETE FROM "post_views_daily" WHERE "day" < ${cutoff}::date RETURNING "post_id"
  `)) as unknown as Rows<{ post_id: number }>
  return result.rows.length
}
