import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-22 (M3-01): Telegram avtopost.
 *
 * - `telegram.post` task slug'i (`payload_jobs`, `payload_jobs_log`);
 * - `posts.telegram[]`: `chat_id` (xabar qaysi chatda — tahrirlash uchun), `kind`
 *   (`photo` → `editMessageCaption`, `text` → `editMessageText`), `hash` (yuborilgan matn xeshi —
 *   sarlavha/lid o'zgarganini aniqlash). Versiya jadvalida ham (Payload sxemasi).
 *
 * `down`: tugallanmagan `telegram.post` job'lari (va ularning loglari) o'chiriladi — aks holda
 * enum qayta yaratilganda cast xato beradi.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_telegram_kind" AS ENUM('photo', 'text');
  CREATE TYPE "public"."enum__posts_v_version_telegram_kind" AS ENUM('photo', 'text');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'telegram.post' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'telegram.post' BEFORE 'schedulePublish';
  ALTER TABLE "posts_telegram" ADD COLUMN "chat_id" varchar;
  ALTER TABLE "posts_telegram" ADD COLUMN "kind" "enum_posts_telegram_kind";
  ALTER TABLE "posts_telegram" ADD COLUMN "hash" varchar;
  ALTER TABLE "_posts_v_version_telegram" ADD COLUMN "chat_id" varchar;
  ALTER TABLE "_posts_v_version_telegram" ADD COLUMN "kind" "enum__posts_v_version_telegram_kind";
  ALTER TABLE "_posts_v_version_telegram" ADD COLUMN "hash" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'telegram.post';
  DELETE FROM "payload_jobs" WHERE "task_slug" = 'telegram.post';
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'feed.poll', 'item.fetch', 'item.extract', 'item.dedupe', 'item.classify', 'maintenance.cleanup', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'feed.poll', 'item.fetch', 'item.extract', 'item.dedupe', 'item.classify', 'maintenance.cleanup', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  ALTER TABLE "posts_telegram" DROP COLUMN "chat_id";
  ALTER TABLE "posts_telegram" DROP COLUMN "kind";
  ALTER TABLE "posts_telegram" DROP COLUMN "hash";
  ALTER TABLE "_posts_v_version_telegram" DROP COLUMN "chat_id";
  ALTER TABLE "_posts_v_version_telegram" DROP COLUMN "kind";
  ALTER TABLE "_posts_v_version_telegram" DROP COLUMN "hash";
  DROP TYPE "public"."enum_posts_telegram_kind";
  DROP TYPE "public"."enum__posts_v_version_telegram_kind";`)
}
