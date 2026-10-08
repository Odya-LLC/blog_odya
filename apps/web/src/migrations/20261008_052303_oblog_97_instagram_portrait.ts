import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-97: "Instagram rasmi" standarti — 4:5 (`portrait`). Profil to'ri postlarni 3:4 plitka
 * qilib kesadi, 4:5 eng kam yo'qotadi. Faqat ustun standarti o'zgaradi — saqlangan qiymat
 * (`square`) o'zgarmaydi, uni admin'da qo'lda almashtirish kerak.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "social_settings" ALTER COLUMN "instagram_image" SET DEFAULT 'portrait';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "social_settings" ALTER COLUMN "instagram_image" SET DEFAULT 'square';`)
}
