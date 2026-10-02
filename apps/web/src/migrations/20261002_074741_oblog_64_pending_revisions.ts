import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-64: chop etilgan postdagi kutilayotgan o'zgarish belgisi — `revisionSubmittedAt`,
 * `revisionSubmittedBy` (MCP `submit_for_review` qoralama versiyaga yozadi, chop etish o'chiradi).
 * Amalda faqat `_posts_v` da qiymat bo'ladi; `posts` ustunlari Payload sxemasi uchun (doim NULL).
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN "revision_submitted_at" timestamp(3) with time zone;
  ALTER TABLE "posts" ADD COLUMN "revision_submitted_by_id" integer;
  ALTER TABLE "_posts_v" ADD COLUMN "version_revision_submitted_at" timestamp(3) with time zone;
  ALTER TABLE "_posts_v" ADD COLUMN "version_revision_submitted_by_id" integer;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_revision_submitted_by_id_users_id_fk" FOREIGN KEY ("revision_submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_revision_submitted_by_id_users_id_fk" FOREIGN KEY ("version_revision_submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "posts_revision_submitted_by_idx" ON "posts" USING btree ("revision_submitted_by_id");
  CREATE INDEX "_posts_v_version_version_revision_submitted_by_idx" ON "_posts_v" USING btree ("version_revision_submitted_by_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DROP CONSTRAINT "posts_revision_submitted_by_id_users_id_fk";
  
  ALTER TABLE "_posts_v" DROP CONSTRAINT "_posts_v_version_revision_submitted_by_id_users_id_fk";
  
  DROP INDEX "posts_revision_submitted_by_idx";
  DROP INDEX "_posts_v_version_version_revision_submitted_by_idx";
  ALTER TABLE "posts" DROP COLUMN "revision_submitted_at";
  ALTER TABLE "posts" DROP COLUMN "revision_submitted_by_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_revision_submitted_at";
  ALTER TABLE "_posts_v" DROP COLUMN "version_revision_submitted_by_id";`)
}
