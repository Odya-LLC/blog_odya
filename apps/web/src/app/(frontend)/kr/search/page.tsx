import type { Metadata } from 'next'

import { type SearchParams, searchPageMetadata, SearchView } from '@/site/views/SearchView'

type Props = { searchParams: Promise<SearchParams> }

/** `/kr/search?q=` — kirill; lotin varianti bilan bir xil (`(latn)/search/page.tsx`). */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return searchPageMetadata('uz-Cyrl', await searchParams)
}

export default async function SearchPage({ searchParams }: Props) {
  return <SearchView locale="uz-Cyrl" params={await searchParams} />
}
