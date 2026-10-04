import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-71: `POST /api/views` uchun IP bo'yicha takror va limitlar (`src/pageviews/ratelimit.ts`).
 * Payload sxemasidan tashqaridagi jadval (OBLOG-69 jadvallari kabi), yozish — to'g'ridan-to'g'ri
 * SQL (`pageviews/store.ts` → `recordView` bilan bitta so'rovda).
 *
 * `post_view_limits`:
 * - `key` — 16 baytli HMAC (kunlik kalit `PAYLOAD_SECRET` + sanadan), IP o'zi saqlanmaydi;
 * - `hits` — oynadagi urinishlar; `expires_at` — oyna tugashi (≤ 24 soat).
 *
 * UNLOGGED — WAL yozilmaydi (har ko'rishda arzon), Postgres qulasa jadval bo'shaydi — limitlar
 * uchun bu maqbul (vaqtinchalik holat). Muddati o'tgan qatorlarni ba'zi beacon'lar va
 * `maintenance.cleanup` o'chiradi (`expires_at` indeksi).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE UNLOGGED TABLE "post_view_limits" (
    "key" bytea PRIMARY KEY NOT NULL,
    "hits" integer DEFAULT 1 NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL
  );
  CREATE INDEX "post_view_limits_expires_at_idx" ON "post_view_limits" USING btree ("expires_at");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "post_view_limits";`)
}
