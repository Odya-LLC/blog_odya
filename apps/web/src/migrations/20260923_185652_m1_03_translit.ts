import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_glossary_language" AS ENUM('en', 'ru');
  CREATE TYPE "public"."enum_glossary_kind" AS ENUM('term', 'brand', 'abbreviation');
  CREATE TYPE "public"."enum_translit_exceptions_match_type" AS ENUM('whole_word', 'prefix');
  CREATE TABLE "glossary" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"term" varchar NOT NULL,
  	"language" "enum_glossary_language" DEFAULT 'en' NOT NULL,
  	"kind" "enum_glossary_kind" DEFAULT 'term' NOT NULL,
  	"translation" varchar NOT NULL,
  	"do_not_translate" boolean DEFAULT false,
  	"do_not_transliterate" boolean DEFAULT false,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "translit_exceptions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"latin" varchar NOT NULL,
  	"cyrillic" varchar NOT NULL,
  	"match_type" "enum_translit_exceptions_match_type" DEFAULT 'whole_word' NOT NULL,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "media" ADD COLUMN "cyrl_locked" jsonb;
  ALTER TABLE "media" ADD COLUMN "cyrl_stale" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "glossary_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "translit_exceptions_id" integer;
  CREATE INDEX "glossary_term_idx" ON "glossary" USING btree ("term");
  CREATE INDEX "glossary_updated_at_idx" ON "glossary" USING btree ("updated_at");
  CREATE INDEX "glossary_created_at_idx" ON "glossary" USING btree ("created_at");
  CREATE UNIQUE INDEX "translit_exceptions_latin_idx" ON "translit_exceptions" USING btree ("latin");
  CREATE INDEX "translit_exceptions_updated_at_idx" ON "translit_exceptions" USING btree ("updated_at");
  CREATE INDEX "translit_exceptions_created_at_idx" ON "translit_exceptions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_glossary_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."glossary"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_translit_exceptions_fk" FOREIGN KEY ("translit_exceptions_id") REFERENCES "public"."translit_exceptions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_glossary_id_idx" ON "payload_locked_documents_rels" USING btree ("glossary_id");
  CREATE INDEX "payload_locked_documents_rels_translit_exceptions_id_idx" ON "payload_locked_documents_rels" USING btree ("translit_exceptions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // FK/indeks/ustunlar avval, jadvallar keyin (CASCADE FK'ni oldinroq o'chirib yubormasligi uchun).
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_glossary_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_translit_exceptions_fk";
  DROP INDEX "payload_locked_documents_rels_glossary_id_idx";
  DROP INDEX "payload_locked_documents_rels_translit_exceptions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "glossary_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "translit_exceptions_id";
  ALTER TABLE "media" DROP COLUMN "cyrl_locked";
  ALTER TABLE "media" DROP COLUMN "cyrl_stale";
  DROP TABLE "glossary" CASCADE;
  DROP TABLE "translit_exceptions" CASCADE;
  DROP TYPE "public"."enum_glossary_language";
  DROP TYPE "public"."enum_glossary_kind";
  DROP TYPE "public"."enum_translit_exceptions_match_type";`)
}
