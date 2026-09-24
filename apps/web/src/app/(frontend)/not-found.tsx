import { DEFAULT_LOCALE } from '@blog-odya/shared'
import type { Metadata } from 'next'

import { NotFound } from '@/components/blog/NotFound'

export const metadata: Metadata = {
  title: 'Sahifa topilmadi — Blog Odya',
  robots: { index: false },
}

/**
 * `notFound()` uchun 404 (frontend segmentlari). Header/Footer va kirill varianti M1-05/M1-07 da
 * (joriy yozuv URL'dan aniqlanadi).
 */
export default function FrontendNotFound() {
  return (
    <main id="content" className="px-4">
      <NotFound locale={DEFAULT_LOCALE} />
    </main>
  )
}
