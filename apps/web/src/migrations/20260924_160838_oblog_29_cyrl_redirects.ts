import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-29: kirill sinxronlash (`cyrl_locked`, `cyrl_stale`) — pages, categories, authors va
 * site-settings, header, footer; `redirects` ↔ `authors` (plugin-redirects reference).
 *
 * Mavjud ma'lumot: bu kolleksiya/global'larda avval avtomatik kirill yo'q edi — mavjud kirill matni
 * qo'lda kiritilgan (seed yoki admin). Lotin keyin saqlanganda u qayta yozilmasligi uchun
 * qulflanadi (kategoriyalar — TZ §10.4: kirill nomlari qo'lda tasdiqlangan). Sahifalar kirill
 * versiyasiz edi (lotinga fallback) — qulflanmaydi, keyingi saqlashda avtomatik to'ladi.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN "cyrl_locked" jsonb;
  ALTER TABLE "pages" ADD COLUMN "cyrl_stale" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_cyrl_locked" jsonb;
  ALTER TABLE "_pages_v" ADD COLUMN "version_cyrl_stale" boolean DEFAULT false;
  ALTER TABLE "categories" ADD COLUMN "cyrl_locked" jsonb;
  ALTER TABLE "categories" ADD COLUMN "cyrl_stale" boolean DEFAULT false;
  ALTER TABLE "authors" ADD COLUMN "cyrl_locked" jsonb;
  ALTER TABLE "authors" ADD COLUMN "cyrl_stale" boolean DEFAULT false;
  ALTER TABLE "redirects_rels" ADD COLUMN "authors_id" integer;
  ALTER TABLE "site_settings" ADD COLUMN "cyrl_locked" jsonb;
  ALTER TABLE "site_settings" ADD COLUMN "cyrl_stale" boolean DEFAULT false;
  ALTER TABLE "header" ADD COLUMN "cyrl_locked" jsonb;
  ALTER TABLE "header" ADD COLUMN "cyrl_stale" boolean DEFAULT false;
  ALTER TABLE "footer" ADD COLUMN "cyrl_locked" jsonb;
  ALTER TABLE "footer" ADD COLUMN "cyrl_stale" boolean DEFAULT false;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "redirects_rels_authors_id_idx" ON "redirects_rels" USING btree ("authors_id");

  UPDATE "categories" SET "cyrl_locked" = '{"name":true,"description":true,"meta":true}'::jsonb
    WHERE EXISTS (SELECT 1 FROM "categories_locales" l
      WHERE l."_parent_id" = "categories"."id" AND l."_locale" = 'uz-Cyrl');
  UPDATE "authors" SET "cyrl_locked" = '{"name":true,"position":true,"bio":true}'::jsonb
    WHERE EXISTS (SELECT 1 FROM "authors_locales" l
      WHERE l."_parent_id" = "authors"."id" AND l."_locale" = 'uz-Cyrl');
  UPDATE "site_settings" SET "cyrl_locked" = '{"siteName":true,"tagline":true,"description":true}'::jsonb
    WHERE EXISTS (SELECT 1 FROM "site_settings_locales" l
      WHERE l."_parent_id" = "site_settings"."id" AND l."_locale" = 'uz-Cyrl');
  UPDATE "header" SET "cyrl_locked" = '{"navItems":true,"moreItems":true}'::jsonb
    WHERE EXISTS (SELECT 1 FROM "header_nav_items_locales" l WHERE l."_locale" = 'uz-Cyrl')
       OR EXISTS (SELECT 1 FROM "header_more_items_locales" l WHERE l."_locale" = 'uz-Cyrl');
  UPDATE "footer" SET "cyrl_locked" = '{"columns":true,"copyright":true}'::jsonb
    WHERE EXISTS (SELECT 1 FROM "footer_columns_links_locales" l WHERE l."_locale" = 'uz-Cyrl')
       OR EXISTS (SELECT 1 FROM "footer_columns_locales" l WHERE l."_locale" = 'uz-Cyrl');`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "redirects_rels" DROP CONSTRAINT "redirects_rels_authors_fk";

  DROP INDEX "redirects_rels_authors_id_idx";
  ALTER TABLE "pages" DROP COLUMN "cyrl_locked";
  ALTER TABLE "pages" DROP COLUMN "cyrl_stale";
  ALTER TABLE "_pages_v" DROP COLUMN "version_cyrl_locked";
  ALTER TABLE "_pages_v" DROP COLUMN "version_cyrl_stale";
  ALTER TABLE "categories" DROP COLUMN "cyrl_locked";
  ALTER TABLE "categories" DROP COLUMN "cyrl_stale";
  ALTER TABLE "authors" DROP COLUMN "cyrl_locked";
  ALTER TABLE "authors" DROP COLUMN "cyrl_stale";
  ALTER TABLE "redirects_rels" DROP COLUMN "authors_id";
  ALTER TABLE "site_settings" DROP COLUMN "cyrl_locked";
  ALTER TABLE "site_settings" DROP COLUMN "cyrl_stale";
  ALTER TABLE "header" DROP COLUMN "cyrl_locked";
  ALTER TABLE "header" DROP COLUMN "cyrl_stale";
  ALTER TABLE "footer" DROP COLUMN "cyrl_locked";
  ALTER TABLE "footer" DROP COLUMN "cyrl_stale";`)
}
