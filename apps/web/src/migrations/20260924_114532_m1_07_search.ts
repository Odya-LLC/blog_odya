import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * M1-07: sayt qidiruvi — Postgres FTS (TZ §3.6, §7, §8.1 `/search?q=`).
 *
 * Payload sxemasi o'zgarmaydi (snapshot `.json` oldingisi bilan bir xil): bu yerda faqat
 * qo'lda yozilgan SQL — Payload/Drizzle bilmaydigan generated ustunlar va indekslar
 * (`push: false`, shuning uchun hech kim ularni o'chirmaydi; Payload INSERT/SELECT'lari ustunlarni
 * aniq sanaydi).
 *
 * - `odya_search_normalize(text)` — qidiruv kaliti: kichik harf, kirill → lotin, apostroflar
 *   (`ʻ ʼ ' ‘ ’` …) va `ъ`/`ь` olib tashlanadi, `ye → e`, qolgan belgilar → bo'shliq.
 *   JS'dagi egizagi — `src/site/search/normalize.ts` (`normalizeSearchText`); test ikkisini
 *   solishtiradi. `unaccent()` ishlatilmaydi: u `STABLE`, generated ustunda bo'lmaydi.
 * - `odya_lexical_text(jsonb)` — Lexical JSON'dagi barcha `text` tugunlari.
 * - `posts_locales.search_vector` — `simple` konfiguratsiya, og'irliklar: sarlavha A, lid B,
 *   matn C (har bir yozuv qatori alohida; kirill qatori bo'sh bo'lsa — lotin qatori topiladi,
 *   chunki kirill so'rovi ham lotin kalitga keltiriladi).
 * - `posts_locales.search_title` + `pg_trgm` GIN — xato yozilgan so'rovlar uchun (`<%`).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE EXTENSION IF NOT EXISTS pg_trgm;

  CREATE OR REPLACE FUNCTION odya_search_normalize(input text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    RETURN btrim(regexp_replace(
      replace(
        translate(
          replace(replace(replace(replace(replace(replace(replace(
            lower(coalesce(input, '')),
            'ш', 'sh'), 'щ', 'sh'), 'ч', 'ch'), 'я', 'ya'), 'ю', 'yu'), 'ё', 'yo'), 'ц', 'ts'),
          'абвгдезийклмнопрстуфхэыжқғўҳʻʼ''‘’\`´ʹьъ',
          'abvgdeziyklmnoprstufxeijqgoh'
        ),
        'ye', 'e'
      ),
      '[^a-z0-9]+', ' ', 'g'
    ));

  CREATE OR REPLACE FUNCTION odya_lexical_text(doc jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    RETURN coalesce(
      (
        SELECT string_agg(value, ' ')
        FROM jsonb_array_elements_text(
          jsonb_path_query_array(doc, 'strict $.**.text ? (@.type() == "string")', '{}', true)
        ) AS value
      ),
      ''
    );

  ALTER TABLE "posts_locales" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, odya_search_normalize("title")), 'A') ||
    setweight(to_tsvector('simple'::regconfig, odya_search_normalize("excerpt")), 'B') ||
    setweight(to_tsvector('simple'::regconfig, odya_search_normalize(odya_lexical_text("content"))), 'C')
  ) STORED;

  ALTER TABLE "posts_locales" ADD COLUMN "search_title" text GENERATED ALWAYS AS (
    odya_search_normalize("title")
  ) STORED;

  CREATE INDEX "posts_locales_search_vector_idx" ON "posts_locales" USING gin ("search_vector");
  CREATE INDEX "posts_locales_search_title_trgm_idx" ON "posts_locales" USING gin ("search_title" gin_trgm_ops);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "posts_locales_search_title_trgm_idx";
  DROP INDEX IF EXISTS "posts_locales_search_vector_idx";
  ALTER TABLE "posts_locales" DROP COLUMN IF EXISTS "search_title";
  ALTER TABLE "posts_locales" DROP COLUMN IF EXISTS "search_vector";
  DROP FUNCTION IF EXISTS odya_lexical_text(jsonb);
  DROP FUNCTION IF EXISTS odya_search_normalize(text);
  `)
}
