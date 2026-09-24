/**
 * `robots.txt` (TZ §8.3): `/admin`, `/api`, `/search`, `/kr/search` yopiq; sitemap'lar
 * ko'rsatiladi. Indekslash yopiq muhitda (Vercel preview, `SEO_NOINDEX=1`) — `Disallow: /`.
 * Yon ta'sirsiz — unit testlanadi.
 */
import type { MetadataRoute } from 'next'

import { absoluteUrl, isIndexingAllowed, siteOrigin } from './config'

export const ROBOTS_DISALLOW = ['/admin', '/api', '/search', '/kr/search'] as const
/**
 * Media fayllar Payload orqali berilganda (`MEDIA_PUBLIC_URL` yo'q) — rasmlar indekslanishi
 * uchun ochiq (aniqroq `Allow` qoidasi `Disallow: /api` dan ustun).
 */
export const ROBOTS_ALLOW = ['/', '/api/media/file/'] as const

export function robotsConfig(
  indexingAllowed: boolean = isIndexingAllowed(),
  origin: string = siteOrigin(),
): MetadataRoute.Robots {
  if (!indexingAllowed) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }
  return {
    rules: [{ userAgent: '*', allow: [...ROBOTS_ALLOW], disallow: [...ROBOTS_DISALLOW] }],
    sitemap: [absoluteUrl('/sitemap.xml', origin), absoluteUrl('/news-sitemap.xml', origin)],
  }
}

/** Preview'da barcha javoblarga `X-Robots-Tag` (HTML'dan tashqari: XML, rasm, API). */
export const NOINDEX_HEADER = { key: 'X-Robots-Tag', value: 'noindex, nofollow' } as const
