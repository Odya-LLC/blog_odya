import type { MetadataRoute } from 'next'

import { robotsConfig } from '@/site/seo/robots'

/** Muhit o'zgaruvchilari runtime'da o'qiladi (preview / `SEO_NOINDEX`) — build'da muzlatilmaydi. */
export const dynamic = 'force-dynamic'

/** `/robots.txt` (TZ §8.3). Preview'da — `Disallow: /`. */
export default function robots(): MetadataRoute.Robots {
  return robotsConfig()
}
