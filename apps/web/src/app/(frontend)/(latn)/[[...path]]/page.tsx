import type { Metadata } from 'next'

import { SiteRoutePage, siteRouteMetadata } from '@/site/views/SiteRoute'

type Props = { params: Promise<{ path?: string[] }> }

/** ISR: publish/unpublish'da teg bo'yicha yangilanadi (`src/site/revalidate.ts`), zaxira — 1 soat. */
export const revalidate = 3600

/**
 * Build'da hech bir sahifa (bosh sahifa ham) oldindan chizilmaydi — `next build` DB'ga ulanmaydi
 * (OBLOG-31). Birinchi so'rovda chiziladi, keyin ISR keshidan beriladi.
 */
export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params
  return siteRouteMetadata('uz-Latn', path)
}

export default async function SitePage({ params }: Props) {
  const { path } = await params
  return <SiteRoutePage locale="uz-Latn" path={path} />
}
