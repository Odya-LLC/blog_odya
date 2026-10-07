import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-94: Instagram rasmi ustida qisqa sarlavha.
 *
 * - `posts_locales.social_title` (+ `_posts_v_locales.version_social_title`) — "Rasm uchun qisqa
 *   sarlavha" (ixtiyoriy, ≤ 70 belgi; kirill — avtomatik translit).
 * - `social_settings.image_overlay` (standart — yoqiq) va `image_scheme` (`dark` | `brand`,
 *   standart — `dark`) — "Ijtimoiy tarmoqlar (Make)" global'idagi rasm shabloni sozlamalari.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_social_settings_image_scheme" AS ENUM('dark', 'brand');
  ALTER TABLE "posts_locales" ADD COLUMN "social_title" varchar;
  ALTER TABLE "_posts_v_locales" ADD COLUMN "version_social_title" varchar;
  ALTER TABLE "social_settings" ADD COLUMN "image_overlay" boolean DEFAULT true;
  ALTER TABLE "social_settings" ADD COLUMN "image_scheme" "enum_social_settings_image_scheme" DEFAULT 'dark';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts_locales" DROP COLUMN "social_title";
  ALTER TABLE "_posts_v_locales" DROP COLUMN "version_social_title";
  ALTER TABLE "social_settings" DROP COLUMN "image_overlay";
  ALTER TABLE "social_settings" DROP COLUMN "image_scheme";
  DROP TYPE "public"."enum_social_settings_image_scheme";`)
}
