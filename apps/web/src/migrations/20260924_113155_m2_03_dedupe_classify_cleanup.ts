import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * M2-03 (OBLOG-17): `item.dedupe`, `item.classify`, `maintenance.cleanup` task slug'lari,
 * `sources.feeds[].mappingWeight`, `scraping-settings.stats`.
 *
 * Ma'lumot migratsiyasi (seed mavjud manbalarni yangilamaydi, shuning uchun shu yerda):
 * - umumiy feedlar ("... (umumiy)") — `mapping_weight = 1`, The Verge "Tech" — 5;
 * - seed manbalariga (slug bo'yicha) M2-03 da qo'shilgan kalit so'z qoidalari qo'shiladi — faqat
 *   manbada hali bo'lmagan keyword'lar (admin tahrirlari saqlanadi). Ro'yxat
 *   `packages/shared/seed/sources.json` bilan bir xil. Toza DB'da (manbalar yo'q) — hech narsa.
 */

const SEED_SOURCE_SLUGS = ['the-verge', 'techcrunch', 'habr', 'ixbt', 'dexerto', 'hltv', '3dnews']

type RuleGroup = [category: string, boost: number, keywords: string[]]

const ADDED_RULES: Record<'en' | 'ru', RuleGroup[]> = {
  en: [
    ['suniy-intellekt', 5, ['ai', 'gpt*', 'gemini', 'claude', 'copilot', 'grok*', 'deepseek*']],
    ['texnologiyalar', 2, ['youtube', 'instagram', 'facebook', 'whatsapp', 'app store']],
    [
      'gadjetlar',
      4,
      ['smart glasses', 'headset*', 'tablet*', 'ipad*', 'macbook*', 'apple watch', 'vr'],
    ],
    ['dasturlash', 4, ['coding', 'sdk', 'typescript', 'rust', 'framework*', 'linux']],
    ['kiberxavfsizlik', 5, ['cybersecurity', 'spyware', 'breach*', 'exploit*', 'cybercrim*']],
    ['kibersport', 5, ['league of legends', 'vct', 'iem', 'lck']],
    ['oyinlar', 4, ['gaming', 'gamer*', 'rpg', 'dlc']],
    ['startaplar', 4, ['raises', 'venture capital', 'founder*', 'fundraising', 'vc', 'vcs']],
    [
      'ilm-fan',
      4,
      ['satellite*', 'scientist*', 'solar', 'energy', 'ev', 'evs', 'space station', 'moon'],
    ],
  ],
  ru: [
    [
      'suniy-intellekt',
      5,
      ['ai', 'ml', 'gpt*', 'gemini', 'claude', 'grok*', 'deepseek*', 'нейронн*'],
    ],
    [
      'texnologiyalar',
      2,
      ['интернет*', 'мтс', 'билайн', 'мегафон', 'telegram', 'whatsapp', 'youtube', 'вконтакте'],
    ],
    ['gadjetlar', 4, ['gpu*', 'пк', 'компьютер*', 'монитор*', 'умн* час*', 'macbook*', 'ipad*']],
    [
      'dasturlash',
      4,
      ['api', 'sdk', 'cli', 'ide', 'rust', 'typescript', 'linux', 'язык* программировани*'],
    ],
    [
      'kiberxavfsizlik',
      5,
      [
        'кибербезопасност*',
        'информационн* безопасност*',
        'шпион*',
        'ботнет*',
        'шифровальщик*',
        'эксплойт*',
      ],
    ],
    ['kibersport', 5, ['iem', 'blast', 'pgl', 'esl']],
    ['oyinlar', 4, ['gta', 'шутер*', 'rpg', 'dlc']],
    ['startaplar', 4, ['привлекл*', 'венчур*']],
    ['ilm-fan', 4, ['энерги*', 'солнечн*', 'медицин*', 'спутник*', 'климат*', 'физик*']],
  ],
}

function addedRuleRows() {
  const rows: { lang: string; keyword: string; category: string; boost: number; ord: number }[] = []
  for (const [lang, groups] of Object.entries(ADDED_RULES)) {
    for (const [category, boost, keywords] of groups) {
      for (const keyword of keywords)
        rows.push({ lang, keyword, category, boost, ord: rows.length })
    }
  }
  return rows
}

function slugList() {
  return sql.join(
    SEED_SOURCE_SLUGS.map((slug) => sql`${slug}`),
    sql`, `,
  )
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'item.dedupe' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'item.classify' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'maintenance.cleanup' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'item.dedupe' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'item.classify' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'maintenance.cleanup' BEFORE 'schedulePublish';
  ALTER TABLE "sources_feeds" ADD COLUMN "mapping_weight" numeric DEFAULT 10;
  ALTER TABLE "scraping_settings" ADD COLUMN "stats" jsonb;`)

  // --- Ma'lumot: mapping bali ---
  await db.execute(sql`
    UPDATE "sources_feeds" SET "mapping_weight" = 1 WHERE "feed_category" ILIKE '%(umumiy%';
    UPDATE "sources_feeds" SET "mapping_weight" = 5
    WHERE "feed_category" = 'Tech' AND "url" LIKE 'https://www.theverge.com/%';`)

  // --- Ma'lumot: seed manbalariga yangi kalit so'z qoidalari ---
  await db.execute(sql`
    INSERT INTO "sources_keyword_rules" ("_order", "_parent_id", "id", "keyword", "category_id", "boost")
    SELECT
      COALESCE((SELECT max(r."_order") FROM "sources_keyword_rules" r WHERE r."_parent_id" = s."id"), 0)
        + row_number() OVER (PARTITION BY s."id" ORDER BY x."ord"),
      s."id",
      substr(md5(random()::text || s."id"::text || x."keyword"), 1, 24),
      x."keyword",
      c."id",
      x."boost"
    FROM "sources" s
    JOIN jsonb_to_recordset(${JSON.stringify(addedRuleRows())}::jsonb)
      AS x("lang" text, "keyword" text, "category" text, "boost" int, "ord" int)
      ON x."lang" = s."language"::text
    JOIN "categories" c ON c."slug" = x."category"
    WHERE s."slug" IN (${slugList()})
      AND NOT EXISTS (
        SELECT 1 FROM "sources_keyword_rules" r
        WHERE r."_parent_id" = s."id" AND r."keyword" = x."keyword"
      );`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const keywords = [...new Set(addedRuleRows().map((row) => row.keyword))]
  await db.execute(sql`
    DELETE FROM "sources_keyword_rules" r
    USING "sources" s
    WHERE r."_parent_id" = s."id"
      AND s."slug" IN (${slugList()})
      AND r."keyword" IN (${sql.join(
        keywords.map((keyword) => sql`${keyword}`),
        sql`, `,
      )});`)
  await db.execute(sql`
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'feed.poll', 'item.fetch', 'item.extract', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'feed.poll', 'item.fetch', 'item.extract', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  ALTER TABLE "sources_feeds" DROP COLUMN "mapping_weight";
  ALTER TABLE "scraping_settings" DROP COLUMN "stats";`)
}
