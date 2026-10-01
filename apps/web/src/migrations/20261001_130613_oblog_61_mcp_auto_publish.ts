import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * OBLOG-61: `scraping-settings.mcpAutoPublish` — "Avtomatik nashr (MCP)". Standart — o'chiq
 * (`false`): mavjud xatti-harakat saqlanadi, MCP postlari tekshiruvga tushadi.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "scraping_settings" ADD COLUMN "mcp_auto_publish" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "scraping_settings" DROP COLUMN "mcp_auto_publish";`)
}
