import type { MetadataRoute } from 'next'

import { getSiteStrings } from '@/i18n/site'
import { BRAND_DARK, BRAND_ICONS, BRAND_NAME } from '@/site/seo/config'

/**
 * `/manifest.webmanifest` (OBLOG-96): ilova nomi va "b" belgisi ikonkalari (Android "bosh ekranga
 * qo'shish", Chrome). Manifest bitta — lotin (asosiy yozuv); kirill sahifalari ham shuni oladi.
 */
export default function manifest(): MetadataRoute.Manifest {
  const t = getSiteStrings('uz-Latn')
  return {
    name: BRAND_NAME['uz-Latn'],
    short_name: BRAND_NAME['uz-Latn'],
    description: t.tagline,
    lang: 'uz',
    start_url: '/',
    scope: '/',
    display: 'minimal-ui',
    background_color: BRAND_DARK,
    theme_color: BRAND_DARK,
    icons: [
      { src: BRAND_ICONS.icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: BRAND_ICONS.icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: BRAND_ICONS.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
