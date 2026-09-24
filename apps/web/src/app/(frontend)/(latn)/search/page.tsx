import type { Metadata } from 'next'

import { type SearchParams, searchPageMetadata, SearchView } from '@/site/views/SearchView'

type Props = { searchParams: Promise<SearchParams> }

/**
 * `/search?q=` — alohida papka (catch-all'dan ustun): `searchParams` o'qiydi, shuning uchun
 * dinamik (har so'rovda); catch-all sahifalari ISR'da qoladi. `noindex` (TZ §8.1).
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return searchPageMetadata('uz-Latn', await searchParams)
}

export default async function SearchPage({ searchParams }: Props) {
  return <SearchView locale="uz-Latn" params={await searchParams} />
}
