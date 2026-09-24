import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "scraped_items" ADD COLUMN "reject_reason" varchar;
  ALTER TABLE "scraped_items" ADD COLUMN "handled_by_id" integer;
  ALTER TABLE "scraped_items" ADD COLUMN "handled_at" timestamp(3) with time zone;
  ALTER TABLE "scraped_items" ADD CONSTRAINT "scraped_items_handled_by_id_users_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "scraped_items_handled_by_idx" ON "scraped_items" USING btree ("handled_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "scraped_items" DROP CONSTRAINT "scraped_items_handled_by_id_users_id_fk";
  
  DROP INDEX "scraped_items_handled_by_idx";
  ALTER TABLE "scraped_items" DROP COLUMN "reject_reason";
  ALTER TABLE "scraped_items" DROP COLUMN "handled_by_id";
  ALTER TABLE "scraped_items" DROP COLUMN "handled_at";`)
}
