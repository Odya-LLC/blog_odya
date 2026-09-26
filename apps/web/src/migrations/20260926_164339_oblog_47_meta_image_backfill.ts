import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-47: bo'sh `meta.image` (SEO rasmi) ← `coverImage`, barcha locale'larda (`_locales` enum).
 * Sxema o'zgarmaydi — faqat ma'lumot. Yangi saqlashlarda buni `posts.meta.image` hook'i qiladi
 * (`collections/Posts/metaImage.ts`); bu — mavjud postlar uchun bir martalik to'ldirish.
 *
 * - `posts_locales`: `meta_image_id IS NULL` va muqova bor → muqova; locale qatori yo'q bo'lsa —
 *   faqat `meta_image_id` bilan yaratiladi (boshqa maydonlar NULL — o'qishda odatdagi fallback).
 * - `_posts_v_locales`: xuddi shu, faqat oxirgi versiya (`latest = true`) — admin qoralamani
 *   oxirgi versiyadan o'qiydi. Eski versiyalar (tarix) o'zgarmaydi.
 *
 * Idempotent: faqat bo'sh qiymatlar to'ldiriladi, qo'lda tanlangan SEO rasmlariga tegilmaydi.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  UPDATE "posts_locales" AS l
  SET "meta_image_id" = p."cover_image_id"
  FROM "posts" AS p
  WHERE l."_parent_id" = p."id"
    AND l."meta_image_id" IS NULL
    AND p."cover_image_id" IS NOT NULL;

  INSERT INTO "posts_locales" ("_locale", "_parent_id", "meta_image_id")
  SELECT loc."code", p."id", p."cover_image_id"
  FROM "posts" AS p
  CROSS JOIN unnest(enum_range(NULL::"_locales")) AS loc("code")
  WHERE p."cover_image_id" IS NOT NULL
  ON CONFLICT ("_locale", "_parent_id") DO NOTHING;

  UPDATE "_posts_v_locales" AS l
  SET "version_meta_image_id" = v."version_cover_image_id"
  FROM "_posts_v" AS v
  WHERE l."_parent_id" = v."id"
    AND v."latest" = true
    AND l."version_meta_image_id" IS NULL
    AND v."version_cover_image_id" IS NOT NULL;

  INSERT INTO "_posts_v_locales" ("_locale", "_parent_id", "version_meta_image_id")
  SELECT loc."code", v."id", v."version_cover_image_id"
  FROM "_posts_v" AS v
  CROSS JOIN unnest(enum_range(NULL::"_locales")) AS loc("code")
  WHERE v."latest" = true
    AND v."version_cover_image_id" IS NOT NULL
  ON CONFLICT ("_locale", "_parent_id") DO NOTHING;`)
}

/**
 * Qaytarilmaydi: to'ldirilgan qiymatni qo'lda tanlangan (muqovaga teng) SEO rasmidan ajratib
 * bo'lmaydi. `meta.image` bo'sh bo'lganda ham sayt muqovani ishlatgani uchun (og:image zanjiri)
 * qoldirish xavfsiz.
 */
export async function down(_args: MigrateDownArgs): Promise<void> {}
