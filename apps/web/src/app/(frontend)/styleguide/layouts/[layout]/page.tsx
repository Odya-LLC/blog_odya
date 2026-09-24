import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isStyleguideEnabled } from '@/lib/styleguide'

import { isLayoutName, LayoutPreview } from '../../_data/layouts'
import { localeFromParam } from '../../_data/params'

export const metadata: Metadata = {
  title: 'Maket — Styleguide — Blog Odya',
  robots: { index: false, follow: false, nocache: true },
}

type Props = {
  params: Promise<{ layout: string }>
  searchParams: Promise<{ script?: string | string[] }>
}

/** To'liq sahifa maketi (styleguide ichidagi iframe'lar uchun, 360 / 1280 px). */
export default async function StyleguideLayoutPage({ params, searchParams }: Props) {
  const [{ layout }, { script }] = await Promise.all([params, searchParams])
  if (!isStyleguideEnabled()) notFound()
  if (!isLayoutName(layout)) notFound()
  return <LayoutPreview layout={layout} locale={localeFromParam(script)} />
}
