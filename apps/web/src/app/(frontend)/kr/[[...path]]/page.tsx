import type { Metadata } from 'next'

import { SiteRoutePage, siteRouteMetadata } from '@/site/views/SiteRoute'

type Props = { params: Promise<{ path?: string[] }> }

/**
 * OBLOG-81: umumiy catch-all har bir so'rovda chiziladi (build DB'ga ulanmaydi).
 * Bosh/kategoriya yangiliklari to'g'ridan-to'g'ri DB'dan; boshqa ma'lumotlar o'zining
 * `unstable_cache` keshini saqlaydi. Umumiy marshrut HTML/RSC natijasini keshlamaydi.
 */
export const revalidate = 0

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params
  return siteRouteMetadata('uz-Cyrl', path)
}

export default async function SitePage({ params }: Props) {
  const { path } = await params
  return <SiteRoutePage locale="uz-Cyrl" path={path} />
}
