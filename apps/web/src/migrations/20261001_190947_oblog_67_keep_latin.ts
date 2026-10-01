import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-67: kirill versiyasida lotinda qoladigan atamalar.
 * - `posts.keepLatin` (JSON ro'yxat, lokalizatsiya qilinmagan) — MCP `save_rewrite(keepLatin)` yoki
 *   admin; versiyalarda ham (`_posts_v.version_keep_latin`).
 * - `tags.doNotTransliterate` — brend teg (standart `false`: mavjud teglar odatdagidek o'giriladi).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN "keep_latin" jsonb;
  ALTER TABLE "_posts_v" ADD COLUMN "version_keep_latin" jsonb;
  ALTER TABLE "tags" ADD COLUMN "do_not_transliterate" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DROP COLUMN "keep_latin";
  ALTER TABLE "_posts_v" DROP COLUMN "version_keep_latin";
  ALTER TABLE "tags" DROP COLUMN "do_not_transliterate";`)
}
