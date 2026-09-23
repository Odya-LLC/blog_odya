import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('uz-Latn', 'uz-Cyrl');
  CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'editor');
  CREATE TYPE "public"."enum_media_license" AS ENUM('own', 'press_kit', 'unsplash', 'pexels', 'cc_by', 'ai_generated', 'other');
  CREATE TABLE "media_locales" (
  	"alt" varchar NOT NULL,
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "name" varchar;
  -- Mavjud foydalanuvchilar: ism — e-pochtaning @ gacha qismi.
  UPDATE "users" SET "name" = split_part("email", '@', 1) WHERE "name" IS NULL;
  ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "users" ADD COLUMN "role" "enum_users_role" DEFAULT 'editor' NOT NULL;
  -- Rollardan oldin yaratilgan foydalanuvchilar (birinchi admin) — admin.
  UPDATE "users" SET "role" = 'admin';
  ALTER TABLE "users" ADD COLUMN "enable_a_p_i_key" boolean;
  ALTER TABLE "users" ADD COLUMN "api_key" varchar;
  ALTER TABLE "users" ADD COLUMN "api_key_index" varchar;
  ALTER TABLE "media" ADD COLUMN "credit" varchar;
  ALTER TABLE "media" ADD COLUMN "license" "enum_media_license" DEFAULT 'own';
  ALTER TABLE "media" ADD COLUMN "license_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_thumb_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_thumb_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumb_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumb_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_thumb_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumb_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_card_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_card_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_card_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_card_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_card_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_card_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_hero_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_hero_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_hero_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_hero_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_hero_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_hero_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_og_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_og_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_og_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_og_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_og_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_og_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_full_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_full_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_full_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_full_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_full_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_full_filename" varchar;
  ALTER TABLE "media_locales" ADD CONSTRAINT "media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "media_locales_locale_parent_id_unique" ON "media_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "media_sizes_thumb_sizes_thumb_filename_idx" ON "media" USING btree ("sizes_thumb_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_hero_sizes_hero_filename_idx" ON "media" USING btree ("sizes_hero_filename");
  CREATE INDEX "media_sizes_og_sizes_og_filename_idx" ON "media" USING btree ("sizes_og_filename");
  CREATE INDEX "media_sizes_full_sizes_full_filename_idx" ON "media" USING btree ("sizes_full_filename");
  -- Mavjud alt matnlar asosiy locale (uz-Latn) ga ko‘chiriladi.
  INSERT INTO "media_locales" ("alt", "_locale", "_parent_id")
    SELECT "alt", 'uz-Latn', "id" FROM "media" WHERE "alt" IS NOT NULL;
  ALTER TABLE "media" DROP COLUMN "alt";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN "alt" varchar;
  UPDATE "media" SET "alt" = COALESCE(
    (SELECT "alt" FROM "media_locales" WHERE "_parent_id" = "media"."id" AND "_locale" = 'uz-Latn'),
    ''
  );
  ALTER TABLE "media" ALTER COLUMN "alt" SET NOT NULL;
  ALTER TABLE "media_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "media_locales" CASCADE;
  DROP INDEX "media_sizes_thumb_sizes_thumb_filename_idx";
  DROP INDEX "media_sizes_card_sizes_card_filename_idx";
  DROP INDEX "media_sizes_hero_sizes_hero_filename_idx";
  DROP INDEX "media_sizes_og_sizes_og_filename_idx";
  DROP INDEX "media_sizes_full_sizes_full_filename_idx";
  ALTER TABLE "users" DROP COLUMN "name";
  ALTER TABLE "users" DROP COLUMN "role";
  ALTER TABLE "users" DROP COLUMN "enable_a_p_i_key";
  ALTER TABLE "users" DROP COLUMN "api_key";
  ALTER TABLE "users" DROP COLUMN "api_key_index";
  ALTER TABLE "media" DROP COLUMN "credit";
  ALTER TABLE "media" DROP COLUMN "license";
  ALTER TABLE "media" DROP COLUMN "license_url";
  ALTER TABLE "media" DROP COLUMN "sizes_thumb_url";
  ALTER TABLE "media" DROP COLUMN "sizes_thumb_width";
  ALTER TABLE "media" DROP COLUMN "sizes_thumb_height";
  ALTER TABLE "media" DROP COLUMN "sizes_thumb_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_thumb_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_thumb_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_card_url";
  ALTER TABLE "media" DROP COLUMN "sizes_card_width";
  ALTER TABLE "media" DROP COLUMN "sizes_card_height";
  ALTER TABLE "media" DROP COLUMN "sizes_card_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_card_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_card_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_hero_url";
  ALTER TABLE "media" DROP COLUMN "sizes_hero_width";
  ALTER TABLE "media" DROP COLUMN "sizes_hero_height";
  ALTER TABLE "media" DROP COLUMN "sizes_hero_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_hero_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_hero_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_og_url";
  ALTER TABLE "media" DROP COLUMN "sizes_og_width";
  ALTER TABLE "media" DROP COLUMN "sizes_og_height";
  ALTER TABLE "media" DROP COLUMN "sizes_og_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_og_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_og_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_full_url";
  ALTER TABLE "media" DROP COLUMN "sizes_full_width";
  ALTER TABLE "media" DROP COLUMN "sizes_full_height";
  ALTER TABLE "media" DROP COLUMN "sizes_full_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_full_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_full_filename";
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_media_license";`)
}
