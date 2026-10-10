import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-118: Instagram story + dayjest karuseli (Make orqali).
 *
 * - `social_settings`: `instagram_mode` (`post` | `story+digest`, standart — `post`: Make ssenariysi
 *   yangilanmaguncha xatti-harakat o'zgarmaydi), `instagram_stories`, `instagram_digest_times`
 *   (`07:30, 12:30, 18:30`), `instagram_daily_limit` (50).
 * - `instagram_digests` (+ `_rels`: `posts`, `skippedPosts`) — dayjest jurnali; `key` UNIQUE
 *   (`ig-digest:{slot}`) — idempotentlik (`claimInstagramDigest`, `src/social/instagram/digest.ts`).
 * - `social_deliveries`: `event` += `post.story`, `status` += `skipped` (story kunlik limit sabab).
 *
 * `down`: story va `skipped` qatorlari o'chiriladi — aks holda enum qayta yaratilganda cast xato beradi.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_instagram_digests_status" AS ENUM('pending', 'sent', 'empty', 'retry', 'failed');
  CREATE TYPE "public"."enum_instagram_digests_format" AS ENUM('carousel', 'single');
  CREATE TYPE "public"."enum_social_settings_instagram_mode" AS ENUM('post', 'story+digest');
  ALTER TYPE "public"."enum_social_deliveries_event" ADD VALUE 'post.story';
  ALTER TYPE "public"."enum_social_deliveries_status" ADD VALUE 'skipped';
  CREATE TABLE "instagram_digests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"slot_at" timestamp(3) with time zone NOT NULL,
  	"status" "enum_instagram_digests_status" DEFAULT 'pending' NOT NULL,
  	"format" "enum_instagram_digests_format",
  	"attempts" numeric,
  	"http_status" numeric,
  	"sent_at" timestamp(3) with time zone,
  	"delivery_id" varchar,
  	"cover_url" varchar,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "instagram_digests_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"posts_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "instagram_digests_id" integer;
  ALTER TABLE "social_settings" ADD COLUMN "instagram_mode" "enum_social_settings_instagram_mode" DEFAULT 'post' NOT NULL;
  ALTER TABLE "social_settings" ADD COLUMN "instagram_stories" boolean DEFAULT true;
  ALTER TABLE "social_settings" ADD COLUMN "instagram_digest_times" varchar DEFAULT '07:30, 12:30, 18:30';
  ALTER TABLE "social_settings" ADD COLUMN "instagram_daily_limit" numeric DEFAULT 50;
  ALTER TABLE "instagram_digests_rels" ADD CONSTRAINT "instagram_digests_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."instagram_digests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "instagram_digests_rels" ADD CONSTRAINT "instagram_digests_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "instagram_digests_key_idx" ON "instagram_digests" USING btree ("key");
  CREATE INDEX "instagram_digests_slot_at_idx" ON "instagram_digests" USING btree ("slot_at");
  CREATE INDEX "instagram_digests_updated_at_idx" ON "instagram_digests" USING btree ("updated_at");
  CREATE INDEX "instagram_digests_created_at_idx" ON "instagram_digests" USING btree ("created_at");
  CREATE INDEX "instagram_digests_rels_order_idx" ON "instagram_digests_rels" USING btree ("order");
  CREATE INDEX "instagram_digests_rels_parent_idx" ON "instagram_digests_rels" USING btree ("parent_id");
  CREATE INDEX "instagram_digests_rels_path_idx" ON "instagram_digests_rels" USING btree ("path");
  CREATE INDEX "instagram_digests_rels_posts_id_idx" ON "instagram_digests_rels" USING btree ("posts_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_instagram_digests_fk" FOREIGN KEY ("instagram_digests_id") REFERENCES "public"."instagram_digests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_instagram_digests_id_idx" ON "payload_locked_documents_rels" USING btree ("instagram_digests_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "social_deliveries" WHERE "event" = 'post.story' OR "status" = 'skipped';
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_instagram_digests_fk";
  DROP TABLE "instagram_digests" CASCADE;
  DROP TABLE "instagram_digests_rels" CASCADE;
  
  ALTER TABLE "social_deliveries" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_social_deliveries_event";
  CREATE TYPE "public"."enum_social_deliveries_event" AS ENUM('post.published');
  ALTER TABLE "social_deliveries" ALTER COLUMN "event" SET DATA TYPE "public"."enum_social_deliveries_event" USING "event"::"public"."enum_social_deliveries_event";
  ALTER TABLE "social_deliveries" ALTER COLUMN "status" SET DATA TYPE text;
  DROP TYPE "public"."enum_social_deliveries_status";
  CREATE TYPE "public"."enum_social_deliveries_status" AS ENUM('sent', 'retry', 'failed');
  ALTER TABLE "social_deliveries" ALTER COLUMN "status" SET DATA TYPE "public"."enum_social_deliveries_status" USING "status"::"public"."enum_social_deliveries_status";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_instagram_digests_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "instagram_digests_id";
  ALTER TABLE "social_settings" DROP COLUMN "instagram_mode";
  ALTER TABLE "social_settings" DROP COLUMN "instagram_stories";
  ALTER TABLE "social_settings" DROP COLUMN "instagram_digest_times";
  ALTER TABLE "social_settings" DROP COLUMN "instagram_daily_limit";
  DROP TYPE "public"."enum_instagram_digests_status";
  DROP TYPE "public"."enum_instagram_digests_format";
  DROP TYPE "public"."enum_social_settings_instagram_mode";`)
}
