import type { Metadata } from 'next'

import {
  parseSearchParams,
  type SearchPageProps,
  searchPageMetadata,
  SearchView,
} from '@/site/views/SearchView'

/** So'rov bo'yicha (`searchParams`) — har doim dinamik; natijalar ma'lumot keshida (`posts` tegi). */
export const dynamic = 'force-dynamic'

export async function generateMetadata(props: SearchPageProps): Promise<Metadata> {
  return searchPageMetadata('uz-Cyrl', props)
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = parseSearchParams(await searchParams)
  return <SearchView locale="uz-Cyrl" {...params} />
}
