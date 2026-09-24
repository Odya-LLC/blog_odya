import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

import { categoryPath, parsePageParam } from '@/site/paths'
import { CategoryView, categoryMetadata } from '@/site/views/CategoryView'

type Props = { params: Promise<{ category: string; n: string }> }

export const revalidate = 3600

export function generateStaticParams() {
  return []
}

async function resolve(params: Props['params']) {
  const { category, n } = await params
  const page = parsePageParam(n)
  if (page === null) notFound()
  // `/…/page/1` — kanonik `/{category}` ga.
  if (page === 1) permanentRedirect(categoryPath('uz-Cyrl', category))
  return { category, page }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, page } = await resolve(params)
  return categoryMetadata({ locale: 'uz-Cyrl', slug: category, page })
}

export default async function CategoryPaginatedPage({ params }: Props) {
  const { category, page } = await resolve(params)
  return <CategoryView locale="uz-Cyrl" slug={category} page={page} />
}
