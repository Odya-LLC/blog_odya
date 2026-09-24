import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_audit_logs_action" AS ENUM('create', 'update', 'publish', 'delete');
  CREATE TYPE "public"."enum_audit_logs_actor_type" AS ENUM('user', 'system');
  CREATE TYPE "public"."enum_audit_logs_channel" AS ENUM('admin', 'rest', 'graphql', 'mcp', 'job');
  CREATE TABLE "audit_logs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"action" "enum_audit_logs_action" NOT NULL,
  	"collection" varchar,
  	"global" varchar,
  	"doc_id" varchar,
  	"title" varchar,
  	"locale" varchar,
  	"diff" jsonb,
  	"actor_type" "enum_audit_logs_actor_type" NOT NULL,
  	"user_id" integer,
  	"channel" "enum_audit_logs_channel" NOT NULL,
  	"tool" varchar,
  	"ip" varchar,
  	"user_agent" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audit_logs_id" integer;
  ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "audit_logs_collection_idx" ON "audit_logs" USING btree ("collection");
  CREATE INDEX "audit_logs_doc_id_idx" ON "audit_logs" USING btree ("doc_id");
  CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");
  CREATE INDEX "audit_logs_channel_idx" ON "audit_logs" USING btree ("channel");
  CREATE INDEX "audit_logs_updated_at_idx" ON "audit_logs" USING btree ("updated_at");
  CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_logs_fk" FOREIGN KEY ("audit_logs_id") REFERENCES "public"."audit_logs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_audit_logs_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_logs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "audit_logs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "audit_logs" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_audit_logs_fk";
  
  DROP INDEX "payload_locked_documents_rels_audit_logs_id_idx";
  ALTER TABLE "users" DROP COLUMN "last_login_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audit_logs_id";
  DROP TYPE "public"."enum_audit_logs_action";
  DROP TYPE "public"."enum_audit_logs_actor_type";
  DROP TYPE "public"."enum_audit_logs_channel";`)
}
