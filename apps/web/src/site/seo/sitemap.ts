/**
 * Sitemap XML quruvchilari (TZ §8.3):
 * - `/sitemap.xml` — index: sahifalar, kategoriyalar, oylik post sitemap'lari;
 * - `/sitemaps/{pages|categories|posts-YYYY-MM}.xml` — `xhtml:link` hreflang alternates bilan
 *   (har bir yozuv alohida `<url>`, har birida ikkala yozuv + `x-default`);
 * - `/news-sitemap.xml` — Google News: oxirgi 48 soat, ikkala yozuv.
 *
 * Yon ta'sirsiz — XML to'g'riligi, nomlar fazosi va 48 soat oynasi unit testlanadi.
 */
import { LOCALES } from '@blog-odya/shared'

import { absoluteUrl, siteOrigin } from './config'
import { type HreflangMap, hreflangUrls } from './metadata'

export const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
export const XHTML_NS = 'http://www.w3.org/1999/xhtml'
export const NEWS_NS = 'http://www.google.com/schemas/sitemap-news/0.9'

/** Google News: faqat oxirgi 2 kun ichida chop etilganlar, ≤ 1000 URL. */
export const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000
export const NEWS_MAX_URLS = 1000
/** sitemaps.org: bitta faylda ≤ 50 000 URL. */
export const SITEMAP_MAX_URLS = 50_000

export const XML_CONTENT_TYPE = 'application/xml; charset=utf-8'

/** XML 1.0 da ruxsat etilmagan belgilar (boshqaruv belgilari, yolg'iz surrogatlar) olib tashlanadi. */
export function stripInvalidXmlChars(value: string): string {
  let result = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    const valid =
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      code >= 0x10000
    if (valid) result += char
  }
  return result
}

/** XML matn/atribut qiymati uchun qochirish (+ XML 1.0 da ruxsat etilmagan boshqaruv belgilari). */
export function xmlEscape(value: string): string {
  return stripInvalidXmlChars(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** W3C Datetime (sitemap `lastmod`, news `publication_date`): ISO 8601, UTC. */
export function w3cDate(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined
  const time = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined
}

export type SitemapUrl = {
  loc: string
  lastmod?: string
  /** hreflang → to'liq URL (`xhtml:link rel="alternate"`). */
  alternates?: Partial<HreflangMap>
}

function alternateLinks(alternates: Partial<HreflangMap> | undefined, indent: string): string[] {
  return Object.entries(alternates ?? {}).flatMap(([hreflang, href]) =>
    href
      ? [
          `${indent}<xhtml:link rel="alternate" hreflang="${xmlEscape(hreflang)}" href="${xmlEscape(href)}"/>`,
        ]
      : [],
  )
}

/**
 * Bitta sahifa (neytral yoki istalgan yozuvdagi yo'l) → ikkala yozuvdagi `<url>` yozuvlari,
 * har birida to'liq hreflang to'plami (Google: har bir URL o'zini va barcha muqobillarini
 * ko'rsatadi).
 */
export function localizedSitemapUrls(
  path: string,
  lastmod?: string | Date | null,
  origin: string = siteOrigin(),
): SitemapUrl[] {
  const alternates = hreflangUrls(path, origin)
  const date = w3cDate(lastmod)
  return LOCALES.map((locale) => ({
    loc: alternates[locale],
    ...(date ? { lastmod: date } : {}),
    alternates,
  }))
}

export function urlsetXml(urls: SitemapUrl[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="${SITEMAP_NS}" xmlns:xhtml="${XHTML_NS}">`,
  ]
  for (const url of urls.slice(0, SITEMAP_MAX_URLS)) {
    lines.push('  <url>', `    <loc>${xmlEscape(url.loc)}</loc>`)
    if (url.lastmod) lines.push(`    <lastmod>${xmlEscape(url.lastmod)}</lastmod>`)
    lines.push(...alternateLinks(url.alternates, '    '), '  </url>')
  }
  lines.push('</urlset>', '')
  return lines.join('\n')
}

export type SitemapIndexEntry = { loc: string; lastmod?: string }

export function sitemapIndexXml(entries: SitemapIndexEntry[]): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<sitemapindex xmlns="${SITEMAP_NS}">`]
  for (const entry of entries) {
    lines.push('  <sitemap>', `    <loc>${xmlEscape(entry.loc)}</loc>`)
    if (entry.lastmod) lines.push(`    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`)
    lines.push('  </sitemap>')
  }
  lines.push('</sitemapindex>', '')
  return lines.join('\n')
}

export type NewsSitemapUrl = {
  loc: string
  title: string
  publicationDate: string
  publicationName: string
  language: string
  alternates?: Partial<HreflangMap>
}

export function newsSitemapXml(urls: NewsSitemapUrl[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="${SITEMAP_NS}" xmlns:news="${NEWS_NS}" xmlns:xhtml="${XHTML_NS}">`,
  ]
  for (const url of urls.slice(0, NEWS_MAX_URLS)) {
    lines.push(
      '  <url>',
      `    <loc>${xmlEscape(url.loc)}</loc>`,
      '    <news:news>',
      '      <news:publication>',
      `        <news:name>${xmlEscape(url.publicationName)}</news:name>`,
      `        <news:language>${xmlEscape(url.language)}</news:language>`,
      '      </news:publication>',
      `      <news:publication_date>${xmlEscape(url.publicationDate)}</news:publication_date>`,
      `      <news:title>${xmlEscape(url.title)}</news:title>`,
      '    </news:news>',
      ...alternateLinks(url.alternates, '    '),
      '  </url>',
    )
  }
  lines.push('</urlset>', '')
  return lines.join('\n')
}

/** Google News oynasi boshlanishi: `now` dan 48 soat oldin. */
export function newsWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - NEWS_WINDOW_MS)
}

/** Sana 48 soatlik oynaga tushadimi (kelajakdagi sana — yo'q). */
export function isWithinNewsWindow(
  date: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const time = date ? Date.parse(date) : NaN
  if (!Number.isFinite(time)) return false
  return time >= newsWindowStart(now).getTime() && time <= now.getTime()
}

// ---------------------------------------------------------------------------
// Sitemap fayllari nomlari
// ---------------------------------------------------------------------------

/** `/sitemaps/{file}` — ichki ro'yxat (`/sitemap.xml`, `/news-sitemap.xml` — rewrite orqali). */
export const SITEMAP_DIR = '/sitemaps'

export type SitemapFile =
  | { kind: 'index' }
  | { kind: 'news' }
  | { kind: 'pages' }
  | { kind: 'categories' }
  | { kind: 'posts'; month: string }

/** `2026-09-24T…` → `2026-09` (UTC). */
export function monthKey(date: string | Date): string | null {
  const time = date instanceof Date ? date.getTime() : Date.parse(date)
  if (!Number.isFinite(time)) return null
  return new Date(time).toISOString().slice(0, 7)
}

/** Oy chegaralari (UTC): `[start, end)`. */
export function monthRange(month: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month)
  if (!match) return null
  const year = Number(match[1])
  const index = Number(match[2]) - 1
  return {
    start: new Date(Date.UTC(year, index, 1)).toISOString(),
    end: new Date(Date.UTC(year, index + 1, 1)).toISOString(),
  }
}

export function sitemapFileName(file: SitemapFile): string {
  return file.kind === 'posts' ? `posts-${file.month}.xml` : `${file.kind}.xml`
}

export function sitemapFileUrl(file: SitemapFile, origin: string = siteOrigin()): string {
  if (file.kind === 'index') return absoluteUrl('/sitemap.xml', origin)
  if (file.kind === 'news') return absoluteUrl('/news-sitemap.xml', origin)
  return absoluteUrl(`${SITEMAP_DIR}/${sitemapFileName(file)}`, origin)
}

export function parseSitemapFile(name: string): SitemapFile | null {
  switch (name) {
    case 'index.xml':
      return { kind: 'index' }
    case 'news.xml':
      return { kind: 'news' }
    case 'pages.xml':
      return { kind: 'pages' }
    case 'categories.xml':
      return { kind: 'categories' }
  }
  const match = /^posts-(\d{4}-\d{2})\.xml$/.exec(name)
  return match?.[1] && monthRange(match[1]) ? { kind: 'posts', month: match[1] } : null
}
