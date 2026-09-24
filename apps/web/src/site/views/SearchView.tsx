import type { Locale } from '@blog-odya/shared'
import { ArrowLeftIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/blog/EmptyState'
import { SearchForm } from '@/components/blog/SearchForm'
import { Container } from '@/components/blog/SiteShell'
import { buttonVariants } from '@/components/ui/button'
import { getSiteStrings } from '@/i18n/site'
import { cn } from '@/lib/utils'

import { homePath, parsePageParam, searchPath } from '../paths'
import { searchMetadata } from '../seo/pages'
import { getSearchResults, SEARCH_MAX_PAGE } from '../search'
import { cleanSearchQuery, isSearchableQuery } from '../search-normalize'
import { PostListing } from './PostListing'
import { SitePage } from './SitePage'

/** `app/.../search/page.tsx` `searchParams` (Next.js: Promise). */
export type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>
}

export type SearchParams = { query: string; page: number }

/** `?q=…&page=n` → toza so'rov va sahifa (noto'g'ri `page` — 1, maksimum — `SEARCH_MAX_PAGE`). */
export function parseSearchParams(params: {
  q?: string | string[]
  page?: string | string[]
}): SearchParams {
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page
  const page = rawPage ? (parsePageParam(rawPage) ?? 1) : 1
  return { query: cleanSearchQuery(params.q), page: Math.min(page, SEARCH_MAX_PAGE) }
}

export async function searchPageMetadata(
  locale: Locale,
  { searchParams }: SearchPageProps,
): Promise<Metadata> {
  const { query } = parseSearchParams(await searchParams)
  return searchMetadata(locale, query)
}

/**
 * Qidiruv `/search?q=` (`/kr/search?q=`) — TZ §8.1: `noindex`, robots.txt'da yopiq. Postgres FTS +
 * `pg_trgm`, so'rov lotin yoki kirillda (`src/site/search.ts`). JS'siz ishlaydi (GET forma).
 */
export async function SearchView({ locale, query, page }: { locale: Locale } & SearchParams) {
  const t = getSiteStrings(locale)
  const searchable = isSearchableQuery(query)
  const results = searchable ? await getSearchResults(locale, query, page) : null

  return (
    <SitePage locale={locale} pathname={searchPath(locale, query, page)}>
      <Container className="flex max-w-3xl flex-col gap-8 py-8 lg:py-12">
        <header className="flex flex-col gap-4">
          <h1 className="font-display text-3xl font-extrabold text-fg">
            {query ? t.searchResultsFor(query) : t.searchTitle}
          </h1>
          <SearchForm locale={locale} defaultValue={query} />
          {results && results.totalDocs > 0 ? (
            <p className="text-sm text-subtle" role="status">
              {t.searchCount(results.totalDocs)}
            </p>
          ) : null}
        </header>
        {!query ? (
          <p className="text-muted">{t.searchPrompt}</p>
        ) : !results ? (
          <p className="text-muted" role="status">
            {t.searchTooShort}
          </p>
        ) : results.totalDocs === 0 ? (
          <EmptyState
            title={t.emptyTitle}
            description={t.emptySearch(query)}
            action={
              <Link
                href={homePath(locale)}
                className={cn(buttonVariants({ variant: 'outline' }), 'rounded-full')}
              >
                <ArrowLeftIcon aria-hidden />
                {t.backHome}
              </Link>
            }
          />
        ) : (
          <PostListing
            locale={locale}
            posts={results.posts}
            page={page}
            totalPages={results.totalPages}
            hrefFor={(n) => searchPath(locale, query, n)}
            emptyText={t.emptySearch(query)}
            testId="search-results"
          />
        )}
      </Container>
    </SitePage>
  )
}
