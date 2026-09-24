import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SearchForm } from '@/components/blog/SearchForm'
import { getSiteStrings } from '@/i18n/site'

import { loadSearchResults, type SearchResults } from '../data'
import { parsePageParam, searchPath } from '../paths'
import { parseSearchQuery } from '../search/normalize'
import { searchMetadata } from '../seo/pages'
import { ListingBody } from './ListingView'
import { SitePage } from './SitePage'

export type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/** `?page=` — faqat butun son ≥ 2; noto'g'ri qiymat — 1-sahifa. */
function pageFrom(params: SearchParams): number {
  return parsePageParam(first(params.page)) ?? 1
}

/** Qidiruv sahifasi har doim `noindex` (TZ §8.1; `robots.txt` da ham yopiq). */
export function searchPageMetadata(locale: Locale, params: SearchParams): Metadata {
  const query = parseSearchQuery(first(params.q))
  return searchMetadata(locale, query?.display ?? null)
}

/**
 * `/search?q=` va `/kr/search?q=` — Postgres FTS (lotin + kirill, `oʻ`/`o'` variantlari,
 * `search/normalize.ts`). Bo'sh/qisqa so'rov — faqat forma; natija yo'q — bo'sh holat.
 */
export async function SearchView({ locale, params }: { locale: Locale; params: SearchParams }) {
  const t = getSiteStrings(locale)
  const raw = first(params.q).trim()
  const query = parseSearchQuery(raw)
  const page = query ? pageFrom(params) : 1
  const results: SearchResults | null = query ? await loadSearchResults(locale, query, page) : null
  if (results && page > results.totalPages) notFound()
  const display = query?.display ?? raw

  return (
    <SitePage locale={locale} pathname={searchPath(locale, query?.display, page)}>
      <ListingBody
        locale={locale}
        testId="search-results"
        header={
          <header className="flex flex-col gap-4 border-b border-border pb-6">
            <h1 className="font-display text-3xl font-extrabold text-fg sm:text-4xl">
              {query ? t.searchResultsTitle(query.display) : t.searchTitle}
            </h1>
            <SearchForm locale={locale} defaultValue={display} className="w-full max-w-xl" />
            {results ? (
              <p className="text-sm text-muted" role="status">
                {t.searchResultsCount(results.total)}
              </p>
            ) : (
              <p className="text-sm text-muted">{raw ? t.searchTooShort : t.searchPrompt}</p>
            )}
          </header>
        }
        posts={results?.posts ?? []}
        emptyText={query ? t.emptySearch(query.display) : null}
        page={page}
        totalPages={results?.totalPages ?? 1}
        hrefForPage={(n) => searchPath(locale, query?.display, n)}
      />
    </SitePage>
  )
}
