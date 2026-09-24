import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts_locales" ADD COLUMN "cover_alt" varchar;
  ALTER TABLE "_posts_v_locales" ADD COLUMN "version_cover_alt" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts_locales" DROP COLUMN "cover_alt";
  ALTER TABLE "_posts_v_locales" DROP COLUMN "version_cover_alt";`)
}
