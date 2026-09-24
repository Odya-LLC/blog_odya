/**
 * Sayt qidiruvi (TZ §7 "Postgres FTS", §8.1 `/search?q=`): lotin va kirill, `oʻ`/`o'` variantlari.
 *
 * Indeks — `posts_locales.search_vector` (FTS, `simple` lug'at, prefiks mosligi `:*`) va
 * `posts_locales.search_text` (`pg_trgm` word similarity — xato yozilgan so'zlar) — migratsiya
 * `20260924_103704_m1_07_search`. Ikkala yozuv qatorlari ham bitta normallashtirilgan ko'rinishda
 * (`search-normalize.ts`), shuning uchun kirill so'rov lotin maqolani topadi va aksincha.
 *
 * SQL faqat mos post ID'larini (reyting bo'yicha, sahifalangan) qaytaradi; kartochkalar Payload
 * Local API bilan `overrideAccess: false` — faqat chop etilgan, arxivlanmagan postlar (TZ §4.1).
 */
import type { Locale } from '@blog-odya/shared'
import { sql } from '@payloadcms/db-postgres'

import type { PostSummary } from '@/components/blog/types'
import type { Post } from '@/payload-types'

import { CACHE_TAGS } from './cache-tags'
import { cached, hasDatabase, payloadClient } from './data'
import { toPostSummaries } from './mappers'
import { isSearchableQuery, normalizeSearchText } from './search-normalize'

export const SEARCH_PAGE_SIZE = 10

/** Juda uzoq sahifalashni cheklash (bot'lar uchun). */
export const SEARCH_MAX_PAGE = 50

export type SearchResults = {
  posts: PostSummary[]
  page: number
  totalPages: number
  totalDocs: number
}

type MatchRow = { id: number | string; total: number | string }

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }> }

/** Mos post ID'lari (reyting → sana bo'yicha) va jami soni. */
export async function searchPostIds(
  db: Executor,
  normalizedQuery: string,
  limit: number,
  offset: number,
): Promise<{ ids: Array<number | string>; total: number }> {
  const { rows } = await db.execute(sql`
    WITH q AS (
      SELECT ${normalizedQuery}::text AS text, oblog_search_tsquery(${normalizedQuery}::text) AS tsq
    ),
    matches AS (
      SELECT p.id, p.published_at,
        max(
          coalesce(ts_rank_cd(l.search_vector, q.tsq), 0) +
          word_similarity(q.text, l.search_text)
        ) AS rank
      FROM posts_locales l
      JOIN posts p ON p.id = l._parent_id
      CROSS JOIN q
      WHERE p._status = 'published'
        AND p.workflow_status IS DISTINCT FROM 'archived'
        AND (l.search_vector @@ q.tsq OR q.text <% l.search_text)
      GROUP BY p.id, p.published_at
    )
    SELECT id, count(*) OVER () AS total
    FROM matches
    ORDER BY rank DESC, published_at DESC NULLS LAST, id DESC
    LIMIT ${limit} OFFSET ${offset}
  `)
  const matches = rows as MatchRow[]
  return {
    ids: matches.map((row) => row.id),
    total: matches.length > 0 ? Number(matches[0]!.total) : 0,
  }
}

export async function loadSearchResults(
  locale: Locale,
  query: string,
  page: number,
): Promise<SearchResults> {
  const empty: SearchResults = { posts: [], page, totalPages: 1, totalDocs: 0 }
  if (!hasDatabase() || !isSearchableQuery(query)) return empty
  const payload = await payloadClient()
  const { ids, total } = await searchPostIds(
    payload.db.drizzle as unknown as Executor,
    normalizeSearchText(query),
    SEARCH_PAGE_SIZE,
    (page - 1) * SEARCH_PAGE_SIZE,
  )
  const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE))
  if (ids.length === 0) return { ...empty, totalDocs: total, totalPages }
  const { docs } = await payload.find({
    collection: 'posts',
    locale,
    where: { id: { in: ids } },
    limit: ids.length,
    pagination: false,
    depth: 1,
    overrideAccess: false,
    select: {
      title: true,
      slug: true,
      excerpt: true,
      coverImage: true,
      category: true,
      publishedAt: true,
      createdAt: true,
      readingTime: true,
      isBreaking: true,
    },
    populate: { categories: { name: true, slug: true } },
  })
  const byId = new Map((docs as Post[]).map((doc) => [String(doc.id), doc]))
  const ordered = ids.flatMap((id) => byId.get(String(id)) ?? [])
  return { posts: toPostSummaries(ordered, locale), page, totalPages, totalDocs: total }
}

/** Natijalar `posts` tegi bilan keshlanadi (publish/unpublish'da yangilanadi). */
export const getSearchResults = (
  locale: Locale,
  query: string,
  page: number,
): Promise<SearchResults> =>
  cached(
    () => loadSearchResults(locale, query, page),
    ['search', locale, normalizeSearchText(query), String(page)],
    [CACHE_TAGS.posts, CACHE_TAGS.nav],
  )
