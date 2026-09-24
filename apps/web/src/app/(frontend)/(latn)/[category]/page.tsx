import type { Metadata } from 'next'

import { CategoryView, categoryMetadata } from '@/site/views/CategoryView'

type Props = { params: Promise<{ category: string }> }

export const revalidate = 3600

/** Build'da oldindan chizilmaydi (DB build'da majburiy emas) — birinchi so'rovda, keyin ISR. */
export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params
  return categoryMetadata({ locale: 'uz-Latn', slug: category, page: 1 })
}

export default async function CategoryPage({ params }: Props) {
  const { category } = await params
  return <CategoryView locale="uz-Latn" slug={category} page={1} />
}
