import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-112: standart poll oralig'i 15 → 30 daqiqa — scraping tick'i endi har 30 daqiqada
 * (pg_cron `blog-odya-jobs-scrape`, OBLOG-110), 15 daqiqalik oraliq amalda baribir 30 edi.
 *
 * - `scraping_settings.default_poll_interval_min` va `sources.poll_interval_min` — ustun standarti 30.
 * - Global'da saqlangan qiymat aynan eski standart (15) bo'lsa — 30 ga ko'chiriladi (admin uni
 *   o'zgartirmagan, ya'ni standartni kutgan). Boshqa qiymat — admin tanlovi, tegilmaydi.
 * - Manbalarning saqlangan `poll_interval_min` qiymatlari o'zgarmaydi: ular har manba uchun
 *   alohida tanlangan (docs/sources.md); ≤ 30 bo'lgani baribir har tick'da o'qiladi.
 *
 * `down` — faqat ustun standartlari; global qiymati qaytarilmaydi (30 ni admin o'zi qo'ygan
 * bo'lishi mumkin — farqlab bo'lmaydi).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "scraping_settings" ALTER COLUMN "default_poll_interval_min" SET DEFAULT 30;
  ALTER TABLE "sources" ALTER COLUMN "poll_interval_min" SET DEFAULT 30;
  UPDATE "scraping_settings" SET "default_poll_interval_min" = 30 WHERE "default_poll_interval_min" = 15;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "scraping_settings" ALTER COLUMN "default_poll_interval_min" SET DEFAULT 15;
  ALTER TABLE "sources" ALTER COLUMN "poll_interval_min" SET DEFAULT 15;`)
}
