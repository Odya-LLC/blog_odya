import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-57: Google News/Discover va IndexNow.
 *
 * - `media.sizes.news16x9|news4x3|news1x1` (1200×675, 1200×900, 1200×1200 WebP) ustunlari — yangi
 *   yuklashlarda Payload yaratadi; mavjud rasmlar uchun — `pnpm --filter @blog-odya/web
 *   media:regenerate` (`src/scripts/regenerate-media-sizes.ts`). Ustunlar bo'sh bo'lsa sayt
 *   ularni JSON-LD'ga qo'shmaydi.
 * - `indexnow.submit` task slug'i (`payload_jobs`, `payload_jobs_log`).
 *
 * `down`: `indexnow.submit` job'lari (va loglari) o'chiriladi — aks holda enum qayta
 * yaratilganda cast xato beradi. R2 dagi `news*` fayllari o'chirilmaydi.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'indexnow.submit' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'indexnow.submit' BEFORE 'schedulePublish';
  ALTER TABLE "media" ADD COLUMN "sizes_news16x9_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_news16x9_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_news16x9_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_news16x9_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_news16x9_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_news16x9_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_news4x3_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_news4x3_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_news4x3_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_news4x3_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_news4x3_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_news4x3_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_news1x1_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_news1x1_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_news1x1_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_news1x1_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_news1x1_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_news1x1_filename" varchar;
  CREATE INDEX "media_sizes_news16x9_sizes_news16x9_filename_idx" ON "media" USING btree ("sizes_news16x9_filename");
  CREATE INDEX "media_sizes_news4x3_sizes_news4x3_filename_idx" ON "media" USING btree ("sizes_news4x3_filename");
  CREATE INDEX "media_sizes_news1x1_sizes_news1x1_filename_idx" ON "media" USING btree ("sizes_news1x1_filename");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'indexnow.submit';
  DELETE FROM "payload_jobs" WHERE "task_slug" = 'indexnow.submit';
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'feed.poll', 'item.fetch', 'item.extract', 'item.dedupe', 'item.classify', 'maintenance.cleanup', 'telegram.post', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'feed.poll', 'item.fetch', 'item.extract', 'item.dedupe', 'item.classify', 'maintenance.cleanup', 'telegram.post', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "media_sizes_news16x9_sizes_news16x9_filename_idx";
  DROP INDEX "media_sizes_news4x3_sizes_news4x3_filename_idx";
  DROP INDEX "media_sizes_news1x1_sizes_news1x1_filename_idx";
  ALTER TABLE "media" DROP COLUMN "sizes_news16x9_url";
  ALTER TABLE "media" DROP COLUMN "sizes_news16x9_width";
  ALTER TABLE "media" DROP COLUMN "sizes_news16x9_height";
  ALTER TABLE "media" DROP COLUMN "sizes_news16x9_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_news16x9_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_news16x9_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_news4x3_url";
  ALTER TABLE "media" DROP COLUMN "sizes_news4x3_width";
  ALTER TABLE "media" DROP COLUMN "sizes_news4x3_height";
  ALTER TABLE "media" DROP COLUMN "sizes_news4x3_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_news4x3_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_news4x3_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_news1x1_url";
  ALTER TABLE "media" DROP COLUMN "sizes_news1x1_width";
  ALTER TABLE "media" DROP COLUMN "sizes_news1x1_height";
  ALTER TABLE "media" DROP COLUMN "sizes_news1x1_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_news1x1_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_news1x1_filename";`)
}
