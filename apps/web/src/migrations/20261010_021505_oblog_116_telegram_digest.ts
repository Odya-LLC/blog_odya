import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-116: Telegram dayjesti.
 *
 * - `telegram_settings.mode` (`post` | `digest` | `hybrid`, standart — `digest`: mavjud qator ham
 *   dayjest rejimiga o'tadi, egasi so'ragani bo'yicha) va `digest_*` (jadval: har 3 soatda 07–22,
 *   10 band, 5 rasm, sarlavha/pastki qator shablonlari).
 * - `telegram_digests` (+ `_rels`: `posts`, `skippedPosts`) — dayjest jurnali; `key` UNIQUE
 *   (`digest:{script}:{slot}`) — idempotentlik (`claimDigest`, `src/telegram/digest.ts`).
 * - `posts.digest_priority` (0–3) va `posts.telegram_urgent` (+ `_posts_v`).
 * - `telegram.digestEdit` task slug'i (`payload_jobs`, `payload_jobs_log`).
 *
 * `down`: `telegram.digestEdit` job'lari (va loglari) o'chiriladi — aks holda enum qayta
 * yaratilganda cast xato beradi.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_telegram_digests_script" AS ENUM('uz-Latn', 'uz-Cyrl');
  CREATE TYPE "public"."enum_telegram_digests_status" AS ENUM('pending', 'sent', 'empty', 'retry', 'failed');
  CREATE TYPE "public"."enum_telegram_digests_format" AS ENUM('album', 'photo', 'text', 'single');
  CREATE TYPE "public"."enum_telegram_settings_mode" AS ENUM('post', 'digest', 'hybrid');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'telegram.digestEdit' BEFORE 'indexnow.submit';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'telegram.digestEdit' BEFORE 'indexnow.submit';
  CREATE TABLE "telegram_digests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"script" "enum_telegram_digests_script" NOT NULL,
  	"slot_at" timestamp(3) with time zone NOT NULL,
  	"status" "enum_telegram_digests_status" DEFAULT 'pending' NOT NULL,
  	"format" "enum_telegram_digests_format",
  	"chat_id" varchar,
  	"attempts" numeric,
  	"message_ids" jsonb,
  	"sent_at" timestamp(3) with time zone,
  	"hash" varchar,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "telegram_digests_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"posts_id" integer
  );
  
  ALTER TABLE "posts" ADD COLUMN "digest_priority" numeric DEFAULT 0;
  ALTER TABLE "posts" ADD COLUMN "telegram_urgent" boolean DEFAULT false;
  ALTER TABLE "_posts_v" ADD COLUMN "version_digest_priority" numeric DEFAULT 0;
  ALTER TABLE "_posts_v" ADD COLUMN "version_telegram_urgent" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "telegram_digests_id" integer;
  ALTER TABLE "telegram_settings" ADD COLUMN "mode" "enum_telegram_settings_mode" DEFAULT 'digest' NOT NULL;
  ALTER TABLE "telegram_settings" ADD COLUMN "digest_interval_hours" numeric DEFAULT 3;
  ALTER TABLE "telegram_settings" ADD COLUMN "digest_start_hour" numeric DEFAULT 7;
  ALTER TABLE "telegram_settings" ADD COLUMN "digest_end_hour" numeric DEFAULT 22;
  ALTER TABLE "telegram_settings" ADD COLUMN "digest_max_items" numeric DEFAULT 10;
  ALTER TABLE "telegram_settings" ADD COLUMN "digest_max_photos" numeric DEFAULT 5;
  ALTER TABLE "telegram_settings" ADD COLUMN "digest_header" varchar DEFAULT '📰 Kun yangiliklari — {{date}}, {{time}}';
  ALTER TABLE "telegram_settings" ADD COLUMN "digest_footer" varchar DEFAULT '🔗 Barchasi: {{site}}';
  ALTER TABLE "telegram_digests_rels" ADD CONSTRAINT "telegram_digests_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."telegram_digests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "telegram_digests_rels" ADD CONSTRAINT "telegram_digests_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "telegram_digests_key_idx" ON "telegram_digests" USING btree ("key");
  CREATE INDEX "telegram_digests_slot_at_idx" ON "telegram_digests" USING btree ("slot_at");
  CREATE INDEX "telegram_digests_updated_at_idx" ON "telegram_digests" USING btree ("updated_at");
  CREATE INDEX "telegram_digests_created_at_idx" ON "telegram_digests" USING btree ("created_at");
  CREATE INDEX "telegram_digests_rels_order_idx" ON "telegram_digests_rels" USING btree ("order");
  CREATE INDEX "telegram_digests_rels_parent_idx" ON "telegram_digests_rels" USING btree ("parent_id");
  CREATE INDEX "telegram_digests_rels_path_idx" ON "telegram_digests_rels" USING btree ("path");
  CREATE INDEX "telegram_digests_rels_posts_id_idx" ON "telegram_digests_rels" USING btree ("posts_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_telegram_digests_fk" FOREIGN KEY ("telegram_digests_id") REFERENCES "public"."telegram_digests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_telegram_digests_id_idx" ON "payload_locked_documents_rels" USING btree ("telegram_digests_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'telegram.digestEdit';
  DELETE FROM "payload_jobs" WHERE "task_slug" = 'telegram.digestEdit';
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_telegram_digests_fk";
  DROP TABLE "telegram_digests" CASCADE;
  DROP TABLE "telegram_digests_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_telegram_digests_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'feed.poll', 'item.fetch', 'item.extract', 'item.dedupe', 'item.classify', 'maintenance.cleanup', 'telegram.post', 'indexnow.submit', 'make.webhook', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'feed.poll', 'item.fetch', 'item.extract', 'item.dedupe', 'item.classify', 'maintenance.cleanup', 'telegram.post', 'indexnow.submit', 'make.webhook', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_telegram_digests_id_idx";
  ALTER TABLE "posts" DROP COLUMN "digest_priority";
  ALTER TABLE "posts" DROP COLUMN "telegram_urgent";
  ALTER TABLE "_posts_v" DROP COLUMN "version_digest_priority";
  ALTER TABLE "_posts_v" DROP COLUMN "version_telegram_urgent";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "telegram_digests_id";
  ALTER TABLE "telegram_settings" DROP COLUMN "mode";
  ALTER TABLE "telegram_settings" DROP COLUMN "digest_interval_hours";
  ALTER TABLE "telegram_settings" DROP COLUMN "digest_start_hour";
  ALTER TABLE "telegram_settings" DROP COLUMN "digest_end_hour";
  ALTER TABLE "telegram_settings" DROP COLUMN "digest_max_items";
  ALTER TABLE "telegram_settings" DROP COLUMN "digest_max_photos";
  ALTER TABLE "telegram_settings" DROP COLUMN "digest_header";
  ALTER TABLE "telegram_settings" DROP COLUMN "digest_footer";
  DROP TYPE "public"."enum_telegram_digests_script";
  DROP TYPE "public"."enum_telegram_digests_status";
  DROP TYPE "public"."enum_telegram_digests_format";
  DROP TYPE "public"."enum_telegram_settings_mode";`)
}
