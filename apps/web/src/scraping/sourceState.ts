import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { RobotsCacheEntry } from './robots'

/**
 * Manba (= domen) holatini atomar yangilash — to'g'ridan-to'g'ri SQL bilan.
 *
 * Nega Local API emas: `payload.update` butun hujjatni qayta yozadi; bir batch'da parallel
 * ishlaydigan bir nechta `item.fetch` bir-birining `lastRequestAt` / `robotsCache` qiymatini
 * eskisi bilan bosib yuborishi mumkin edi. Bu yerda har bir o'zgarish bitta `UPDATE` —
 * Postgres qator qulfi (row lock) bilan tartiblanadi.
 */

type Rows<T> = { rows: T[] }

function drizzle(payload: Payload) {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

export type SlotReservation =
  /** Slot band qilindi: so'rovni `slotAt` dan keyin yuborish mumkin. */
  | { reserved: true; slotAt: number }
  /** Eng yaqin bo'sh slot `latestAt` dan keyin — hozir band qilinmadi. */
  | { reserved: false; nextAt: number }

/**
 * Domen bo'yicha rate limit (TZ §2.3, §3.5): `sources.last_request_at` ni atomar ravishda
 * `max(now, last + interval)` ga suradi va shu slotni qaytaradi. Slot `latestAt` dan kech
 * bo'lsa (task byudjetiga sig'maydi) hech narsa o'zgartirilmaydi — `nextAt` qaytariladi.
 *
 * Parallel job'lar ketma-ket slotlar oladi: 0 s, +10 s, +20 s ...
 */
export async function reserveRequestSlot(
  payload: Payload,
  sourceId: number,
  options: { intervalMs: number; now: number; latestAt: number },
): Promise<SlotReservation> {
  const now = new Date(options.now).toISOString()
  const latest = new Date(options.latestAt).toISOString()
  const interval = `${Math.max(0, Math.round(options.intervalMs))} milliseconds`
  const db = drizzle(payload)

  const reserved = (await db.execute(sql`
    UPDATE "sources"
    SET "last_request_at" = GREATEST(
      ${now}::timestamptz,
      COALESCE("last_request_at" + ${interval}::interval, ${now}::timestamptz)
    )
    WHERE "id" = ${sourceId}
      AND (
        "last_request_at" IS NULL
        OR "last_request_at" + ${interval}::interval <= ${latest}::timestamptz
      )
    RETURNING "last_request_at" AS "slot"
  `)) as unknown as Rows<{ slot: Date | string }>
  const slot = reserved.rows[0]?.slot
  if (slot) return { reserved: true, slotAt: new Date(slot).getTime() }

  const current = (await db.execute(sql`
    SELECT "last_request_at" + ${interval}::interval AS "next"
    FROM "sources" WHERE "id" = ${sourceId}
  `)) as unknown as Rows<{ next: Date | string | null }>
  const next = current.rows[0]?.next
  if (!next) throw new Error(`Manba topilmadi: ${sourceId}`)
  return { reserved: false, nextAt: new Date(next).getTime() }
}

/** `sources.robots_cache[origin]` ni yangilaydi (boshqa origin'lar saqlanadi). */
export async function saveRobotsEntry(
  payload: Payload,
  sourceId: number,
  entry: RobotsCacheEntry,
): Promise<void> {
  await drizzle(payload).execute(sql`
    UPDATE "sources"
    SET "robots_cache" = (
      CASE WHEN jsonb_typeof("robots_cache") = 'object' THEN "robots_cache" ELSE '{}'::jsonb END
    ) || jsonb_build_object(${entry.origin}::text, ${JSON.stringify(entry)}::jsonb)
    WHERE "id" = ${sourceId}
  `)
}
