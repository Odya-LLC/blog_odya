import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * M1-07: sayt qidiruvi (TZ §7, §8.1) — Postgres FTS + `pg_trgm`, lotin va kirill bitta indeksda.
 *
 * - `oblog_search_normalize(text)` — yozuvdan qat'i nazar bitta "lotin ASCII" ko'rinishi:
 *   kirill → lotin (ў→o, қ→q, ғ→g, ҳ→h, ш→sh, ч→ch, ё→yo, ю→yu, я→ya, ц→ts …), apostrof
 *   variantlari (ʻ ʼ ' ‘ ’ ` ´) olib tashlanadi (`oʻ`/`o'`/`o‘` → `o`), `ye` → `e` (kirill `е`
 *   so'z boshida lotinda `ye`), qolgan belgilar — bo'shliq. Xuddi shu qoidalar TS'da:
 *   `src/site/search/normalize.ts` (moslik integratsion testda tekshiriladi).
 * - `posts_locales.search_vector` (A: sarlavha, B: lid, C: matn — Lexical matn tugunlari) va
 *   `posts_locales.search_text` (sarlavha + lid, trigram uchun) — STORED generated ustunlar:
 *   Payload/Drizzle ularni bilmaydi (INSERT/UPDATE'da ko'rsatilmaydi), Postgres o'zi hisoblaydi.
 *   `push: false` — Drizzle sxemasi DB bilan solishtirilmaydi, ustunlar o'chirilmaydi.
 * - GIN indekslar: `search_vector` (FTS) va `search_text gin_trgm_ops` (xato yozilgan so'zlar).
 *
 * Supabase: `pg_trgm` ruxsat etilgan kengaytma; allaqachon (`extensions` sxemasida) o'rnatilgan
 * bo'lsa `IF NOT EXISTS` hech narsa qilmaydi, `extensions` sxemasi `search_path` da bor.
 * Barcha funksiyalar IMMUTABLE (generated ustun talabi) va faqat `pg_catalog` funksiyalarini
 * ishlatadi. `lower()` locale'ga bog'liq bo'lgani uchun kirill bosh harflari `translate` bilan
 * kichraytiriladi (C locale'li bazada ham bir xil natija).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE EXTENSION IF NOT EXISTS pg_trgm;

  CREATE OR REPLACE FUNCTION oblog_search_normalize(input text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $fn$
    SELECT btrim(regexp_replace(
      replace(
        translate(
          replace(replace(replace(replace(replace(replace(replace(
            translate(
              lower(translate(input,
                'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯЎҚҒҲ',
                'абвгдеёжзийклмнопрстуфхцчшщъыьэюяўқғҳ')),
              'ʻʼ''‘’´ʹ′' || chr(96),
              ''),
            'ё', 'yo'), 'ю', 'yu'), 'я', 'ya'), 'ц', 'ts'), 'ч', 'ch'), 'ш', 'sh'), 'щ', 'sh'),
          'абвгдежзийклмнопрстуфхыэўқғҳъь',
          'abvgdejziyklmnoprstufxieoqgh'),
        'ye', 'e'),
      '[^a-z0-9]+', ' ', 'g'));
  $fn$;

  CREATE OR REPLACE FUNCTION oblog_lexical_text(doc jsonb) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
    SELECT coalesce(string_agg(node #>> '{}', ' '), '')
    FROM jsonb_path_query(coalesce(doc, '{}'::jsonb), 'strict $.**.text') AS node
    WHERE jsonb_typeof(node) = 'string';
  $fn$;

  CREATE OR REPLACE FUNCTION oblog_search_tsquery(normalized text) RETURNS tsquery
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $fn$
    SELECT CASE WHEN btrim(normalized) = '' THEN NULL ELSE
      to_tsquery('simple'::regconfig, array_to_string(ARRAY(
        SELECT word || ':*' FROM regexp_split_to_table(btrim(normalized), ' +') AS word
        WHERE word <> ''
      ), ' & '))
    END;
  $fn$;

  ALTER TABLE "posts_locales" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, oblog_search_normalize(coalesce("title", ''))), 'A') ||
    setweight(to_tsvector('simple'::regconfig, oblog_search_normalize(coalesce("excerpt", ''))), 'B') ||
    setweight(to_tsvector('simple'::regconfig, oblog_search_normalize(oblog_lexical_text("content"))), 'C')
  ) STORED;

  ALTER TABLE "posts_locales" ADD COLUMN "search_text" text GENERATED ALWAYS AS (
    oblog_search_normalize(coalesce("title", '') || ' ' || coalesce("excerpt", ''))
  ) STORED;

  CREATE INDEX "posts_locales_search_vector_idx" ON "posts_locales" USING gin ("search_vector");
  CREATE INDEX "posts_locales_search_text_trgm_idx" ON "posts_locales" USING gin ("search_text" gin_trgm_ops);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // `pg_trgm` kengaytmasi qoldiriladi (boshqa obyektlar ishlatishi mumkin).
  await db.execute(sql`
  DROP INDEX IF EXISTS "posts_locales_search_text_trgm_idx";
  DROP INDEX IF EXISTS "posts_locales_search_vector_idx";
  ALTER TABLE "posts_locales" DROP COLUMN IF EXISTS "search_text";
  ALTER TABLE "posts_locales" DROP COLUMN IF EXISTS "search_vector";
  DROP FUNCTION IF EXISTS oblog_search_tsquery(text);
  DROP FUNCTION IF EXISTS oblog_lexical_text(jsonb);
  DROP FUNCTION IF EXISTS oblog_search_normalize(text);`)
}
