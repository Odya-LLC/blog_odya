import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload, TaskConfig } from 'payload'

import { env } from '@/env'

import {
  CLEANUP_DELETE_LIMIT,
  MAINTENANCE_CLEANUP_TASK,
  R2_LIST_BUDGET_MS,
  REJECTED_RETENTION_DAYS,
  VERSION_TRIM_AFTER_DAYS,
  VERSIONS_TO_KEEP,
} from '../constants'
import { mergeScrapingStats, readScrapingStats, type R2SizeStats } from '../stats'
import {
  type BucketLister,
  createS3BucketLister,
  measureBuckets,
  storageBuckets,
} from '../storageSize'

/**
 * `maintenance.cleanup` (TZ §3.5 #7, §3.7.2) — kuniga 1 marta (`scheduler.enqueueDailyCleanup`),
 * idempotent (qayta ishga tushirilsa — hech narsa buzilmaydi):
 *
 * 1. Qoralamaga aylanmagan (`status ≠ drafted`, `post` yo'q) va `extractedTextRetentionDays`
 *    (30) kundan eski elementlarning `extractedText` i o'chiriladi — metadata (URL, hash,
 *    klaster) dublikat tekshiruvi uchun qoladi.
 * 2. `rejected` elementlar rad etilganidan (`handledAt`, bo'lmasa `updatedAt`) 30 kun o'tgach
 *    to'liq o'chiriladi (bir chaqiruvda ≤ 500; bog'liq jadvallar FK cascade / set null).
 * 3. Chop etilganiga 30 kundan oshgan postlarning versiyalari 3 tagacha kesiladi (eng yangilari
 *    va `latest` versiya saqlanadi).
 * 4. `pg_database_size` va R2 hajmi (`storageSize.ts`) o'lchanib, `scraping-settings.stats` ga
 *    yoziladi — ogohlantirishlar (`alerts.ts`) shu qiymatlarni o'qiydi.
 *
 * `scraping-settings.isEnabled = false` faqat yig'ishni to'xtatadi — tozalash va o'lchov baribir
 * ishlaydi (bepul kvota). Tozalash — to'g'ridan-to'g'ri SQL (har biri bitta so'rov): Local API bilan minglab hujjatni
 * birma-bir yangilash 25 s byudjetga sig'maydi va versiya/hook yuklamasini oshiradi.
 * `extractedText` ni tozalash `status <> 'drafted'` sharti bilan — muharrir shu paytda elementni
 * qoralamaga olsa, Postgres qator qulfidan keyin shartni qayta tekshiradi.
 */

export interface CleanupDeps {
  now: () => number
  /** `undefined` — env'dan (S3), `null` — R2 o'lchanmaydi. */
  lister?: BucketLister | null
  buckets?: string[]
}

export const cleanupDeps: CleanupDeps = { now: () => Date.now() }

export interface CleanupOutput {
  clearedText: number
  deletedRejected: number
  trimmedVersions: number
  dbBytes: number
  r2Bytes: number | null
  r2Complete: boolean | null
}

type Rows<T> = { rows: T[] }

const DAY_MS = 24 * 60 * 60_000

function drizzle(payload: Payload) {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

export async function clearOldExtractedText(
  payload: Payload,
  options: { now: number; retentionDays: number },
): Promise<number> {
  const cutoff = iso(options.now - options.retentionDays * DAY_MS)
  const result = (await drizzle(payload).execute(sql`
    UPDATE "scraped_items"
    SET "extracted_text" = NULL, "updated_at" = now()
    WHERE "created_at" < ${cutoff}::timestamptz
      AND "extracted_text" IS NOT NULL
      AND "status" <> 'drafted'
      AND "post_id" IS NULL
    RETURNING "id"
  `)) as unknown as Rows<{ id: number }>
  return result.rows.length
}

export async function deleteOldRejected(
  payload: Payload,
  options: { now: number; retentionDays: number; limit?: number },
): Promise<number> {
  const cutoff = iso(options.now - options.retentionDays * DAY_MS)
  const result = (await drizzle(payload).execute(sql`
    DELETE FROM "scraped_items"
    WHERE "id" IN (
      SELECT "id" FROM "scraped_items"
      WHERE "status" = 'rejected'
        AND COALESCE("handled_at", "updated_at") < ${cutoff}::timestamptz
        AND "post_id" IS NULL
      ORDER BY "id"
      LIMIT ${options.limit ?? CLEANUP_DELETE_LIMIT}
    )
    RETURNING "id"
  `)) as unknown as Rows<{ id: number }>
  return result.rows.length
}

export async function trimPublishedPostVersions(
  payload: Payload,
  options: { now: number; afterDays: number; keep: number },
): Promise<number> {
  const cutoff = iso(options.now - options.afterDays * DAY_MS)
  const result = (await drizzle(payload).execute(sql`
    DELETE FROM "_posts_v"
    WHERE "id" IN (
      SELECT "id" FROM (
        SELECT v."id", v."latest",
          row_number() OVER (PARTITION BY v."parent_id" ORDER BY v."updated_at" DESC, v."id" DESC) AS "rn"
        FROM "_posts_v" v
        JOIN "posts" p ON p."id" = v."parent_id"
        WHERE p."_status" = 'published' AND p."published_at" < ${cutoff}::timestamptz
      ) ranked
      WHERE ranked."rn" > ${options.keep} AND ranked."latest" IS NOT TRUE
    )
    RETURNING "id"
  `)) as unknown as Rows<{ id: number }>
  return result.rows.length
}

export async function measureDatabaseSize(payload: Payload): Promise<number> {
  const result = (await drizzle(payload).execute(
    sql`SELECT pg_database_size(current_database())::bigint AS "bytes"`,
  )) as unknown as Rows<{ bytes: string | number }>
  return Number(result.rows[0]?.bytes ?? 0)
}

async function measureR2(deps: CleanupDeps): Promise<R2SizeStats | null> {
  const lister = deps.lister === undefined ? createS3BucketLister(env) : deps.lister
  const buckets = deps.buckets ?? storageBuckets(env)
  if (!lister || !buckets.length) return null
  try {
    return await measureBuckets(lister, buckets, {
      deadlineAt: deps.now() + R2_LIST_BUDGET_MS,
      now: deps.now,
    })
  } catch (error) {
    return {
      bytes: 0,
      objects: 0,
      complete: false,
      buckets: [],
      measuredAt: iso(deps.now()),
      error: (error as Error).message?.slice(0, 500) ?? String(error),
    }
  }
}

export async function runCleanup(
  payload: Payload,
  deps: CleanupDeps = cleanupDeps,
): Promise<CleanupOutput> {
  const now = deps.now()
  const [settingsRaw, stats] = await Promise.all([
    payload.findGlobal({ slug: 'scraping-settings', depth: 0 }),
    readScrapingStats(payload),
  ])
  const retentionDays = Math.max(
    1,
    Math.floor(Number(settingsRaw.extractedTextRetentionDays ?? 30) || 30),
  )

  const clearedText = await clearOldExtractedText(payload, { now, retentionDays })
  const deletedRejected = await deleteOldRejected(payload, {
    now,
    retentionDays: REJECTED_RETENTION_DAYS,
  })
  const trimmedVersions = await trimPublishedPostVersions(payload, {
    now,
    afterDays: VERSION_TRIM_AFTER_DAYS,
    keep: VERSIONS_TO_KEEP,
  })
  const dbBytes = await measureDatabaseSize(payload)
  const r2 = await measureR2(deps)

  const output: CleanupOutput = {
    clearedText,
    deletedRejected,
    trimmedVersions,
    dbBytes,
    r2Bytes: r2 && !r2.error ? r2.bytes : null,
    r2Complete: r2 && !r2.error ? r2.complete : null,
  }
  await mergeScrapingStats(payload, {
    db: { bytes: dbBytes, measuredAt: iso(now) },
    ...(r2 ? { r2 } : {}),
    cleanup: {
      ...stats.cleanup,
      lastRunAt: iso(now),
      lastResult: { clearedText, deletedRejected, trimmedVersions, retentionDays },
    },
  })
  payload.logger.info({ msg: 'maintenance.cleanup', ...output })
  return output
}

export const maintenanceCleanupTask: TaskConfig<'maintenance.cleanup'> = {
  slug: MAINTENANCE_CLEANUP_TASK,
  label: 'Kunlik tozalash va hajm o‘lchovi (maintenance.cleanup)',
  interfaceName: 'TaskMaintenanceCleanup',
  retries: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
  inputSchema: [{ name: 'date', type: 'text' }],
  outputSchema: [
    { name: 'clearedText', type: 'number' },
    { name: 'deletedRejected', type: 'number' },
    { name: 'trimmedVersions', type: 'number' },
    { name: 'dbBytes', type: 'number' },
    { name: 'r2Bytes', type: 'number' },
    { name: 'r2Complete', type: 'checkbox' },
  ],
  handler: async ({ req }) => {
    const output = await runCleanup(req.payload)
    return { output }
  },
}
