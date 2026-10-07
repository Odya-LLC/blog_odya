import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-91: Make.com avtopost.
 *
 * - `social_settings` (+ `social_settings_scripts`) — "Ijtimoiy tarmoqlar (Make)" global'i
 *   (standart: o'chiq, faqat lotin, 8 heshteg, `#BlogOdya`).
 * - `social_deliveries` — yuborish jurnali; `key` UNIQUE (`make:{postId}:{event}:{script}`) —
 *   idempotentlik. Post o'chirilsa `post_id` → NULL.
 * - `posts.social_skip` (+ `_posts_v`) — "Ijtimoiy tarmoqlarga (Make) yubormaslik".
 * - `make.webhook` task slug'i (`payload_jobs`, `payload_jobs_log`).
 *
 * `down`: `make.webhook` job'lari (va loglari) o'chiriladi — aks holda enum qayta yaratilganda
 * cast xato beradi.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_social_deliveries_target" AS ENUM('make');
  CREATE TYPE "public"."enum_social_deliveries_event" AS ENUM('post.published');
  CREATE TYPE "public"."enum_social_deliveries_script" AS ENUM('uz-Latn', 'uz-Cyrl');
  CREATE TYPE "public"."enum_social_deliveries_status" AS ENUM('sent', 'retry', 'failed');
  CREATE TYPE "public"."enum_social_settings_scripts" AS ENUM('uz-Latn', 'uz-Cyrl');
  CREATE TYPE "public"."enum_social_settings_instagram_image" AS ENUM('square', 'portrait');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'make.webhook' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'make.webhook' BEFORE 'schedulePublish';
  CREATE TABLE "social_deliveries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"post_id" integer,
  	"target" "enum_social_deliveries_target" DEFAULT 'make' NOT NULL,
  	"event" "enum_social_deliveries_event" NOT NULL,
  	"script" "enum_social_deliveries_script" NOT NULL,
  	"status" "enum_social_deliveries_status" NOT NULL,
  	"http_status" numeric,
  	"attempts" numeric,
  	"sent_at" timestamp(3) with time zone,
  	"delivery_id" varchar,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "social_settings_scripts" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_social_settings_scripts",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "social_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"enabled" boolean DEFAULT false,
  	"webhook_url" varchar,
  	"instagram_image" "enum_social_settings_instagram_image" DEFAULT 'square',
  	"hashtags_count" numeric DEFAULT 8,
  	"brand_hashtag" varchar DEFAULT '#BlogOdya',
  	"instagram_cta" varchar DEFAULT 'To‘liq maqola — profildagi havolada.',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "posts" ADD COLUMN "social_skip" boolean DEFAULT false;
  ALTER TABLE "_posts_v" ADD COLUMN "version_social_skip" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "social_deliveries_id" integer;
  ALTER TABLE "social_deliveries" ADD CONSTRAINT "social_deliveries_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_settings_scripts" ADD CONSTRAINT "social_settings_scripts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."social_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "social_deliveries_key_idx" ON "social_deliveries" USING btree ("key");
  CREATE INDEX "social_deliveries_post_idx" ON "social_deliveries" USING btree ("post_id");
  CREATE INDEX "social_deliveries_updated_at_idx" ON "social_deliveries" USING btree ("updated_at");
  CREATE INDEX "social_deliveries_created_at_idx" ON "social_deliveries" USING btree ("created_at");
  CREATE INDEX "social_settings_scripts_order_idx" ON "social_settings_scripts" USING btree ("order");
  CREATE INDEX "social_settings_scripts_parent_idx" ON "social_settings_scripts" USING btree ("parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_deliveries_fk" FOREIGN KEY ("social_deliveries_id") REFERENCES "public"."social_deliveries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_social_deliveries_id_idx" ON "payload_locked_documents_rels" USING btree ("social_deliveries_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'make.webhook';
  DELETE FROM "payload_jobs" WHERE "task_slug" = 'make.webhook';
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_social_deliveries_fk";
  DROP TABLE "social_deliveries" CASCADE;
  DROP TABLE "social_settings_scripts" CASCADE;
  DROP TABLE "social_settings" CASCADE;

  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'feed.poll', 'item.fetch', 'item.extract', 'item.dedupe', 'item.classify', 'maintenance.cleanup', 'telegram.post', 'indexnow.submit', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'feed.poll', 'item.fetch', 'item.extract', 'item.dedupe', 'item.classify', 'maintenance.cleanup', 'telegram.post', 'indexnow.submit', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_social_deliveries_id_idx";
  ALTER TABLE "posts" DROP COLUMN "social_skip";
  ALTER TABLE "_posts_v" DROP COLUMN "version_social_skip";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_deliveries_id";
  DROP TYPE "public"."enum_social_deliveries_target";
  DROP TYPE "public"."enum_social_deliveries_event";
  DROP TYPE "public"."enum_social_deliveries_script";
  DROP TYPE "public"."enum_social_deliveries_status";
  DROP TYPE "public"."enum_social_settings_scripts";
  DROP TYPE "public"."enum_social_settings_instagram_image";`)
}
