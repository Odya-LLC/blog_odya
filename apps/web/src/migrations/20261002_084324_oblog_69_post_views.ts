import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-69: o'z ko'rishlar hisoblagichi (`src/pageviews/`). Payload sxemasidan tashqaridagi ikki
 * jadval — Payload ular haqida bilmaydi (`push: false`, keyingi `migrate:create` ham ularga
 * tegmaydi), yozish/o'qish to'g'ridan-to'g'ri SQL (`pageviews/store.ts`):
 *
 * - `post_views_daily` — kunlik agregat (Toshkent sanasi), "Ko'p o'qilgan" (7/30 kun) uchun;
 *   `maintenance.cleanup` 90 kundan eskilarini o'chiradi (Supabase Free 500 MB).
 * - `post_views_total` — butun davr bo'yicha jami (kunlik qatorlar o'chirilgandan keyin ham qoladi),
 *   admin'dagi `viewsTotal` ustuni shundan o'qiydi.
 *
 * Post o'chirilsa — qatorlari ham (FK cascade). Shaxsiy ma'lumot (IP, UA) saqlanmaydi.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "post_views_daily" (
    "post_id" integer NOT NULL,
    "day" date NOT NULL,
    "views" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "post_views_daily_pkey" PRIMARY KEY ("post_id", "day")
  );
  CREATE TABLE "post_views_total" (
    "post_id" integer PRIMARY KEY NOT NULL,
    "views" bigint DEFAULT 0 NOT NULL,
    "last_viewed_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  ALTER TABLE "post_views_daily" ADD CONSTRAINT "post_views_daily_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "post_views_total" ADD CONSTRAINT "post_views_total_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "post_views_daily_day_idx" ON "post_views_daily" USING btree ("day");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "post_views_daily";
  DROP TABLE IF EXISTS "post_views_total";`)
}
