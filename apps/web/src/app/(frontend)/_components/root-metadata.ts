import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'

import { getSiteVerification } from '@/site/data'
import { rootLayoutMetadata } from '@/site/seo/pages'

/**
 * Root layout metadata'si: standart qiymatlar + preview'da `noindex` (TZ §8.3, M1-06) va
 * `site-settings` dagi Search Console / Yandex Webmaster tasdiq kodlari
 * (`<meta name="google-site-verification">`, `<meta name="yandex-verification">`).
 */
export async function rootMetadata(locale: Locale): Promise<Metadata> {
  const metadata = rootLayoutMetadata(locale)
  const { google, yandex } = await getSiteVerification()
  if (google || yandex) {
    metadata.verification = {
      ...(google ? { google } : {}),
      ...(yandex ? { yandex } : {}),
    }
  }
  return metadata
}
