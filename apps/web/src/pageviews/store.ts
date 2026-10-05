import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { localDate } from '@/editorial/queue'

import {
  POPULAR_CANDIDATES,
  POPULAR_WINDOW_DAYS,
  type PopularRow,
  type PopularWindow,
} from './popular'
import type { ViewGuard } from './ratelimit'

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
 * `recordView` natijasi: `counted` — hisoblandi; `unknown` — post yo'q yoki ommaga ko'rinmaydi
 * (hech narsa yozilmaydi); `duplicate` — shu IP + UA 30 daqiqada bu postni allaqachon
 * hisoblatgan; `limited` — IP limiti tugagan (OBLOG-71, `ratelimit.ts`).
 */
export type RecordViewResult = 'counted' | 'unknown' | 'duplicate' | 'limited'

/**
 * Bitta ko'rish — **bitta SQL so'rov** (CTE zanjiri): post tekshiruvi → (guard bo'lsa) IP
 * hisoblagichlari upsert + limit tekshiruvi → 30 daqiqalik takror kaliti → kunlik va jami
 * hisoblagich upsert. Guard'siz (IP noma'lum) — faqat post tekshiruvi va hisoblagichlar.
 *
 * `post_view_limits` (UNLOGGED, migratsiya `oblog_71_pageview_ratelimit`): `key` — 16 baytli
 * HMAC (IP o'zi emas), `hits`, `expires_at`. Hisoblagich kalitlari oyna raqamini o'z ichiga
 * oladi (har oynada yangi qator), takror kaliti esa muddati o'tganda qayta "yangilanadi".
 */
export async function recordView(
  payload: Payload,
  postId: number,
  options: { now?: Date; guard?: ViewGuard | null } = {},
): Promise<RecordViewResult> {
  const guard = options.guard ?? null
  const now = guard?.at ?? options.now ?? new Date()
  const day = localDate(now)
  const target = sql`
    SELECT "id" FROM "posts"
    WHERE "id" = ${postId}
      AND "_status" = 'published'
      AND "workflow_status" IS DISTINCT FROM 'archived'`
  const increment = (source: string) => sql`
    daily AS (
      INSERT INTO "post_views_daily" ("post_id", "day", "views")
      SELECT "id", ${day}::date, 1 FROM ${sql.identifier(source)}
      ON CONFLICT ("post_id", "day") DO UPDATE SET "views" = "post_views_daily"."views" + 1
      RETURNING "post_id"
    ), total AS (
      INSERT INTO "post_views_total" ("post_id", "views", "last_viewed_at")
      SELECT "post_id", 1, now() FROM daily
      ON CONFLICT ("post_id") DO UPDATE
        SET "views" = "post_views_total"."views" + 1, "last_viewed_at" = now()
      RETURNING "post_id"
    )`

  if (!guard) {
    const result = (await drizzle(payload).execute(sql`
      WITH target AS (${target}), ${increment('target')}
      SELECT (SELECT count(*) FROM target)::int AS "known",
        (SELECT count(*) FROM total)::int AS "counted"
    `)) as unknown as Rows<{ known: number; counted: number }>
    return Number(result.rows[0]?.counted) > 0 ? 'counted' : 'unknown'
  }

  const at = guard.at.toISOString()
  const limits = sql.join(
    guard.counters.map(
      (counter) =>
        sql`(decode(${counter.key}, 'hex'), ${counter.expiresAt.toISOString()}::timestamptz, ${counter.max}::int)`,
    ),
    sql`, `,
  )
  const result = (await drizzle(payload).execute(sql`
    WITH target AS (${target}),
    limits ("key", "expires_at", "max_hits") AS (VALUES ${limits}),
    counters AS (
      INSERT INTO "post_view_limits" ("key", "hits", "expires_at")
      SELECT l."key", 1, l."expires_at" FROM limits l CROSS JOIN target
      ON CONFLICT ("key") DO UPDATE SET "hits" = "post_view_limits"."hits" + 1
      RETURNING "key", "hits"
    ), allowed AS (
      SELECT "id" FROM target WHERE NOT EXISTS (
        SELECT 1 FROM counters c JOIN limits l ON l."key" = c."key" WHERE c."hits" > l."max_hits"
      )
    ), fresh AS (
      INSERT INTO "post_view_limits" ("key", "hits", "expires_at")
      SELECT decode(${guard.dedupe.key}, 'hex'), 1, ${guard.dedupe.expiresAt.toISOString()}::timestamptz
      FROM allowed
      ON CONFLICT ("key") DO UPDATE SET "hits" = 1, "expires_at" = EXCLUDED."expires_at"
        WHERE "post_view_limits"."expires_at" <= ${at}::timestamptz
      RETURNING "key"
    ), counted AS (
      SELECT "id" FROM allowed WHERE EXISTS (SELECT 1 FROM fresh)
    ), ${increment('counted')}
    SELECT (SELECT count(*) FROM target)::int AS "known",
      (SELECT count(*) FROM allowed)::int AS "allowed",
      (SELECT count(*) FROM total)::int AS "counted"
  `)) as unknown as Rows<{ known: number; allowed: number; counted: number }>
  const row = result.rows[0]
  if (!Number(row?.known)) return 'unknown'
  if (!Number(row?.allowed)) return 'limited'
  return Number(row?.counted) > 0 ? 'counted' : 'duplicate'
}

/**
 * Muddati o'tgan `post_view_limits` qatorlari. `limit` bilan — bitta partiya (beacon'dan keyingi
 * tasodifiy tozalash), `limit`siz — hammasi (`maintenance.cleanup`). O'chirilganlar soni.
 */
export async function deleteExpiredViewLimits(
  payload: Payload,
  options: { now?: Date; limit?: number } = {},
): Promise<number> {
  const now = (options.now ?? new Date()).toISOString()
  const result = (await drizzle(payload).execute(
    options.limit
      ? sql`
        WITH gone AS (
          DELETE FROM "post_view_limits" WHERE "key" IN (
            SELECT "key" FROM "post_view_limits" WHERE "expires_at" <= ${now}::timestamptz
            LIMIT ${options.limit}
          ) RETURNING 1
        ) SELECT count(*)::int AS "deleted" FROM gone`
      : sql`
        WITH gone AS (
          DELETE FROM "post_view_limits" WHERE "expires_at" <= ${now}::timestamptz RETURNING 1
        ) SELECT count(*)::int AS "deleted" FROM gone`,
  )) as unknown as Rows<{ deleted: number }>
  return Number(result.rows[0]?.deleted ?? 0)
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

/**
 * Ommaviy `GET /api/views?id=` (OBLOG-72): ommaga ko'rinadigan postning jami ko'rishlari (hali
 * ko'rilmagan — `0`); post yo'q, chop etilmagan yoki arxivlangan — `null`. Bitta SQL so'rov.
 */
export async function loadPublicViews(payload: Payload, postId: number): Promise<number | null> {
  const result = (await drizzle(payload).execute(sql`
    SELECT COALESCE(t."views", 0) AS "views"
    FROM "posts" p
    LEFT JOIN "post_views_total" t ON t."post_id" = p."id"
    WHERE p."id" = ${postId}
      AND p."_status" = 'published'
      AND p."workflow_status" IS DISTINCT FROM 'archived'
  `)) as unknown as Rows<{ views: string | number }>
  const row = result.rows[0]
  return row ? Number(row.views) : null
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
