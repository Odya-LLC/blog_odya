import type { Metadata } from 'next'

import { ArticleView, articleMetadata } from '@/site/views/ArticleView'

type Props = { params: Promise<{ category: string; slug: string }> }

export const revalidate = 3600

export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug } = await params
  return articleMetadata({ locale: 'uz-Cyrl', categorySlug: category, slug })
}

export default async function ArticlePage({ params }: Props) {
  const { category, slug } = await params
  return <ArticleView locale="uz-Cyrl" categorySlug={category} slug={slug} />
}
