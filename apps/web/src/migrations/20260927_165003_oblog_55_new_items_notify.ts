import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "telegram_settings" ADD COLUMN "notify_new_items" boolean DEFAULT true;
  ALTER TABLE "telegram_settings" ADD COLUMN "new_items_min_count" numeric DEFAULT 1;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "telegram_settings" DROP COLUMN "notify_new_items";
  ALTER TABLE "telegram_settings" DROP COLUMN "new_items_min_count";`)
}
