import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-53: doimiy xato beradigan feed'lar uchun backoff.
 *
 * Sxema — `sources.feeds[]`: `failure_count` (ketma-ket xatolar), `last_error_kind`
 * (`cloudflare` | `http` | `timeout` | `network` | `parse`), `next_poll_at` (backoff tugashi).
 * Mavjud qatorlar: `failure_count = 0`, qolganlari `NULL` — backoff'siz (hozirgi xatti-harakat).
 *
 * Ma'lumot: HLTV.org (`slug = 'hltv'`) nofaol qilinadi — `https://www.hltv.org/rss/news` har
 * qanday User-Agent uchun Cloudflare challenge (403, `cf-mitigated: challenge`) qaytaradi, challenge
 * chetlab o'tilmaydi (docs/sources.md §3.5b). Seed mavjud manbalarni yangilamaydi (M2-03 dagi
 * kabi, shuning uchun shu yerda). Faqat hali faol bo'lsa va `tos_notes` ga izoh qo'shiladi
 * (admin qo'lda o'chirgan bo'lsa — hech narsa o'zgarmaydi). Toza DB'da (manba yo'q) — hech narsa.
 * Admin keyin qayta yoqishi mumkin: migratsiya faqat bir marta ishlaydi.
 *
 * `down`: HLTV faqat shu migratsiya izohi bor bo'lsa qayta yoqiladi (izoh olib tashlanadi).
 */
const HLTV_NOTE =
  '\n\nOBLOG-53 (2026-09-27): o‘chirildi — /rss/news har qanday User-Agent uchun Cloudflare ' +
  'challenge (HTTP 403, cf-mitigated: challenge) qaytaradi; challenge chetlab o‘tilmaydi ' +
  '(docs/sources.md §3.5b). Qayta yoqishdan oldin feed’ni tekshiring.'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sources_feeds_last_error_kind" AS ENUM('cloudflare', 'http', 'timeout', 'network', 'parse');
  ALTER TABLE "sources_feeds" ADD COLUMN "failure_count" numeric DEFAULT 0;
  ALTER TABLE "sources_feeds" ADD COLUMN "last_error_kind" "enum_sources_feeds_last_error_kind";
  ALTER TABLE "sources_feeds" ADD COLUMN "next_poll_at" timestamp(3) with time zone;`)

  await db.execute(sql`
    UPDATE "sources"
    SET "is_active" = false,
      "tos_notes" = COALESCE("tos_notes", '') || ${HLTV_NOTE}
    WHERE "slug" = 'hltv' AND "is_active" = true
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "sources"
    SET "is_active" = true,
      "tos_notes" = replace("tos_notes", ${HLTV_NOTE}, '')
    WHERE "slug" = 'hltv' AND "is_active" = false AND strpos("tos_notes", ${HLTV_NOTE}) > 0
  `)

  await db.execute(sql`
   ALTER TABLE "sources_feeds" DROP COLUMN "failure_count";
  ALTER TABLE "sources_feeds" DROP COLUMN "last_error_kind";
  ALTER TABLE "sources_feeds" DROP COLUMN "next_poll_at";
  DROP TYPE "public"."enum_sources_feeds_last_error_kind";`)
}
