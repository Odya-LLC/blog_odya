import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sources_language" AS ENUM('en', 'ru');
  CREATE TYPE "public"."enum_sources_fetch_mode" AS ENUM('rss_only', 'rss_plus_page');
  CREATE TYPE "public"."enum_scraped_items_status" AS ENUM('pending', 'scraped', 'drafted', 'rejected', 'duplicate', 'error');
  CREATE TYPE "public"."enum_scraped_items_language" AS ENUM('en', 'ru');
  CREATE TYPE "public"."enum_payload_jobs_workflow_slug" AS ENUM('scrapeItem');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'feed.poll' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'feed.poll' BEFORE 'schedulePublish';
  CREATE TABLE "sources_feeds" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"feed_category" varchar,
  	"maps_to_id" integer,
  	"is_active" boolean DEFAULT true,
  	"last_polled_at" timestamp(3) with time zone,
  	"last_status" numeric,
  	"last_new_items" numeric,
  	"etag" varchar,
  	"last_modified" varchar,
  	"last_error" varchar
  );
  
  CREATE TABLE "sources_keyword_rules" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"keyword" varchar NOT NULL,
  	"category_id" integer NOT NULL,
  	"boost" numeric DEFAULT 0
  );
  
  CREATE TABLE "sources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"homepage_url" varchar NOT NULL,
  	"language" "enum_sources_language" NOT NULL,
  	"fetch_mode" "enum_sources_fetch_mode" DEFAULT 'rss_only' NOT NULL,
  	"priority" numeric DEFAULT 25,
  	"poll_interval_min" numeric DEFAULT 15,
  	"rate_limit_sec" numeric DEFAULT 10,
  	"selectors" jsonb,
  	"tos_notes" varchar,
  	"is_active" boolean DEFAULT true,
  	"robots_checked_at" timestamp(3) with time zone,
  	"last_request_at" timestamp(3) with time zone,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "scraped_items_image_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"alt" varchar
  );
  
  CREATE TABLE "scraped_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"source_id" integer NOT NULL,
  	"status" "enum_scraped_items_status" DEFAULT 'pending' NOT NULL,
  	"url" varchar NOT NULL,
  	"canonical_url" varchar,
  	"url_hash" varchar NOT NULL,
  	"author" varchar,
  	"published_at" timestamp(3) with time zone,
  	"language" "enum_scraped_items_language",
  	"excerpt" varchar,
  	"extracted_text" varchar,
  	"content_hash" varchar,
  	"cluster_id" varchar,
  	"raw_html_key" varchar,
  	"clean_html_key" varchar,
  	"fetch_meta" jsonb,
  	"error" varchar,
  	"score" numeric,
  	"word_count" numeric,
  	"suggested_category_id" integer,
  	"post_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "scraped_items_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "posts_sources" ADD COLUMN "scraped_item_id" integer;
  ALTER TABLE "_posts_v_version_sources" ADD COLUMN "scraped_item_id" integer;
  ALTER TABLE "payload_jobs" ADD COLUMN "workflow_slug" "enum_payload_jobs_workflow_slug";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sources_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "scraped_items_id" integer;
  ALTER TABLE "scraping_settings" ADD COLUMN "max_item_age_hours" numeric DEFAULT 72;
  ALTER TABLE "sources_feeds" ADD CONSTRAINT "sources_feeds_maps_to_id_categories_id_fk" FOREIGN KEY ("maps_to_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sources_feeds" ADD CONSTRAINT "sources_feeds_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sources_keyword_rules" ADD CONSTRAINT "sources_keyword_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sources_keyword_rules" ADD CONSTRAINT "sources_keyword_rules_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "scraped_items_image_urls" ADD CONSTRAINT "scraped_items_image_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."scraped_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "scraped_items" ADD CONSTRAINT "scraped_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "scraped_items" ADD CONSTRAINT "scraped_items_suggested_category_id_categories_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "scraped_items" ADD CONSTRAINT "scraped_items_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "scraped_items_texts" ADD CONSTRAINT "scraped_items_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."scraped_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sources_feeds_order_idx" ON "sources_feeds" USING btree ("_order");
  CREATE INDEX "sources_feeds_parent_id_idx" ON "sources_feeds" USING btree ("_parent_id");
  CREATE INDEX "sources_feeds_maps_to_idx" ON "sources_feeds" USING btree ("maps_to_id");
  CREATE INDEX "sources_keyword_rules_order_idx" ON "sources_keyword_rules" USING btree ("_order");
  CREATE INDEX "sources_keyword_rules_parent_id_idx" ON "sources_keyword_rules" USING btree ("_parent_id");
  CREATE INDEX "sources_keyword_rules_category_idx" ON "sources_keyword_rules" USING btree ("category_id");
  CREATE UNIQUE INDEX "sources_slug_idx" ON "sources" USING btree ("slug");
  CREATE INDEX "sources_updated_at_idx" ON "sources" USING btree ("updated_at");
  CREATE INDEX "sources_created_at_idx" ON "sources" USING btree ("created_at");
  CREATE INDEX "scraped_items_image_urls_order_idx" ON "scraped_items_image_urls" USING btree ("_order");
  CREATE INDEX "scraped_items_image_urls_parent_id_idx" ON "scraped_items_image_urls" USING btree ("_parent_id");
  CREATE INDEX "scraped_items_source_idx" ON "scraped_items" USING btree ("source_id");
  CREATE INDEX "scraped_items_status_idx" ON "scraped_items" USING btree ("status");
  CREATE UNIQUE INDEX "scraped_items_url_hash_idx" ON "scraped_items" USING btree ("url_hash");
  CREATE INDEX "scraped_items_published_at_idx" ON "scraped_items" USING btree ("published_at");
  CREATE INDEX "scraped_items_content_hash_idx" ON "scraped_items" USING btree ("content_hash");
  CREATE INDEX "scraped_items_cluster_id_idx" ON "scraped_items" USING btree ("cluster_id");
  CREATE INDEX "scraped_items_score_idx" ON "scraped_items" USING btree ("score");
  CREATE INDEX "scraped_items_suggested_category_idx" ON "scraped_items" USING btree ("suggested_category_id");
  CREATE INDEX "scraped_items_post_idx" ON "scraped_items" USING btree ("post_id");
  CREATE INDEX "scraped_items_updated_at_idx" ON "scraped_items" USING btree ("updated_at");
  CREATE INDEX "scraped_items_created_at_idx" ON "scraped_items" USING btree ("created_at");
  CREATE INDEX "scraped_items_texts_order_parent" ON "scraped_items_texts" USING btree ("order","parent_id");
  ALTER TABLE "posts_sources" ADD CONSTRAINT "posts_sources_scraped_item_id_scraped_items_id_fk" FOREIGN KEY ("scraped_item_id") REFERENCES "public"."scraped_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_version_sources" ADD CONSTRAINT "_posts_v_version_sources_scraped_item_id_scraped_items_id_fk" FOREIGN KEY ("scraped_item_id") REFERENCES "public"."scraped_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scraped_items_fk" FOREIGN KEY ("scraped_items_id") REFERENCES "public"."scraped_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_sources_scraped_item_idx" ON "posts_sources" USING btree ("scraped_item_id");
  CREATE INDEX "_posts_v_version_sources_scraped_item_idx" ON "_posts_v_version_sources" USING btree ("scraped_item_id");
  CREATE INDEX "payload_jobs_workflow_slug_idx" ON "payload_jobs" USING btree ("workflow_slug");
  CREATE INDEX "payload_locked_documents_rels_sources_id_idx" ON "payload_locked_documents_rels" USING btree ("sources_id");
  CREATE INDEX "payload_locked_documents_rels_scraped_items_id_idx" ON "payload_locked_documents_rels" USING btree ("scraped_items_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sources_feeds" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sources_keyword_rules" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sources" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "scraped_items_image_urls" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "scraped_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "scraped_items_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "sources_feeds" CASCADE;
  DROP TABLE "sources_keyword_rules" CASCADE;
  DROP TABLE "sources" CASCADE;
  DROP TABLE "scraped_items_image_urls" CASCADE;
  DROP TABLE "scraped_items" CASCADE;
  DROP TABLE "scraped_items_texts" CASCADE;
  ALTER TABLE "posts_sources" DROP CONSTRAINT "posts_sources_scraped_item_id_scraped_items_id_fk";
  
  ALTER TABLE "_posts_v_version_sources" DROP CONSTRAINT "_posts_v_version_sources_scraped_item_id_scraped_items_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sources_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_scraped_items_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "posts_sources_scraped_item_idx";
  DROP INDEX "_posts_v_version_sources_scraped_item_idx";
  DROP INDEX "payload_jobs_workflow_slug_idx";
  DROP INDEX "payload_locked_documents_rels_sources_id_idx";
  DROP INDEX "payload_locked_documents_rels_scraped_items_id_idx";
  ALTER TABLE "posts_sources" DROP COLUMN "scraped_item_id";
  ALTER TABLE "_posts_v_version_sources" DROP COLUMN "scraped_item_id";
  ALTER TABLE "payload_jobs" DROP COLUMN "workflow_slug";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sources_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "scraped_items_id";
  ALTER TABLE "scraping_settings" DROP COLUMN "max_item_age_hours";
  DROP TYPE "public"."enum_sources_language";
  DROP TYPE "public"."enum_sources_fetch_mode";
  DROP TYPE "public"."enum_scraped_items_status";
  DROP TYPE "public"."enum_scraped_items_language";
  DROP TYPE "public"."enum_payload_jobs_workflow_slug";`)
}
