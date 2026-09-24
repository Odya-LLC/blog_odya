/**
 * Postgres FTS so'rovi (TZ §8.1 `/search?q=`): `posts_locales.search_vector` (ikkala yozuv
 * qatori) + `pg_trgm` (sarlavhadagi xato yozilishlar). Sxema — `migrations/*_m1_07_search.ts`.
 *
 * Faqat ommaga ko'rinadigan postlar (`_status = 'published'`, arxivlanmagan — `posts.access.read`
 * bilan bir xil). Natija — tartiblangan post id'lari va jami soni; kartochkalar keyin Payload
 * Local API bilan (`overrideAccess: false`) olinadi.
 *
 * Xavfsizlik: barcha qiymatlar parametr sifatida uzatiladi (`sql` teg — `$1, $2 …`); `tsquery`
 * esa faqat `[a-z0-9]` so'zlaridan tuziladi (`parseSearchQuery`).
 */
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { SearchQuery } from './normalize'

/**
 * `pg_trgm`: `norm <% search_title` — `word_similarity ≥ pg_trgm.word_similarity_threshold`
 * (standart 0.6), GIN indeks bilan. Faqat ≥ 4 belgili so'rovlarda (qisqalarida shovqin ko'p).
 */
export const SEARCH_TRGM_MIN_LENGTH = 4

export type SearchHits = { ids: number[]; total: number }

type DrizzleLike = {
  execute: (query: unknown) => Promise<{ rows: Array<Record<string, unknown>> }>
}

function drizzleOf(payload: Payload): DrizzleLike {
  return (payload.db as unknown as { drizzle: DrizzleLike }).drizzle
}

export async function searchPostIds(
  payload: Payload,
  query: SearchQuery,
  { limit, offset }: { limit: number; offset: number },
): Promise<SearchHits> {
  const result = await drizzleOf(payload).execute(sql`
    WITH params AS (
      SELECT to_tsquery('simple', ${query.tsquery}) AS tsq, ${query.normalized}::text AS norm
    ),
    matches AS (
      SELECT
        p.id,
        p.published_at,
        max(
          ts_rank_cd(l.search_vector, params.tsq) +
          0.1 * word_similarity(params.norm, coalesce(l.search_title, ''))
        ) AS rank
      FROM posts p
      JOIN posts_locales l ON l._parent_id = p.id
      CROSS JOIN params
      WHERE p._status = 'published'
        AND p.workflow_status IS DISTINCT FROM 'archived'
        AND (
          l.search_vector @@ params.tsq
          OR (
            char_length(params.norm) >= ${SEARCH_TRGM_MIN_LENGTH}
            AND params.norm <% l.search_title
          )
        )
      GROUP BY p.id, p.published_at
    )
    SELECT id, count(*) OVER () AS total
    FROM matches
    ORDER BY rank DESC, published_at DESC NULLS LAST, id DESC
    LIMIT ${limit} OFFSET ${offset}
  `)
  const rows = result.rows
  const total = rows.length > 0 ? Number(rows[0]?.total ?? 0) : 0
  return { ids: rows.map((row) => Number(row.id)), total }
}
