/**
 * RSS 2.0 lentalari (TZ §7, §8.3): `/rss.xml`, `/kr/rss.xml`, `/{category}/rss.xml`
 * (`/kr/{category}/rss.xml`). Yon ta'sirsiz — unit testlanadi.
 */
import type { Locale } from '@blog-odya/shared'

import { categoryPath, homePath } from '../paths'
import { xmlEscape } from './sitemap'

export const RSS_CONTENT_TYPE = 'application/rss+xml; charset=utf-8'
export const RSS_ITEMS_LIMIT = 30
/** Lenta yangilanishi (daqiqa) — o'quvchilar uchun maslahat (`<ttl>`). */
export const RSS_TTL_MINUTES = 30

/** Lenta yo'li: `/rss.xml`, `/kr/rss.xml`, `/{category}/rss.xml`, `/kr/{category}/rss.xml`. */
export function feedPath(locale: Locale, categorySlug?: string | null): string {
  const base = categorySlug ? categoryPath(locale, categorySlug) : homePath(locale)
  return `${base === '/' ? '' : base}/rss.xml`
}

/** RFC 822 sana (RSS `pubDate`): `Thu, 24 Sep 2026 10:00:00 GMT`. */
export function rfc822Date(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  return date.toUTCString()
}

export type RssItem = {
  title: string
  link: string
  description?: string | null
  pubDate: string
  category?: string | null
  author?: string | null
  /** Muqova (`media:content`). */
  image?: { url: string; type?: string; width?: number; height?: number } | null
}

export type RssChannel = {
  title: string
  link: string
  /** Lentaning o'z URL'i (`atom:link rel="self"`). */
  selfUrl: string
  description: string
  language: Locale
  lastBuildDate?: string | null
  image?: { url: string; title: string; link: string } | null
}

export function rssXml(channel: RssChannel, items: RssItem[]): string {
  const e = xmlEscape
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">',
    '  <channel>',
    `    <title>${e(channel.title)}</title>`,
    `    <link>${e(channel.link)}</link>`,
    `    <description>${e(channel.description)}</description>`,
    `    <language>${e(channel.language)}</language>`,
    `    <atom:link href="${e(channel.selfUrl)}" rel="self" type="application/rss+xml"/>`,
    `    <ttl>${RSS_TTL_MINUTES}</ttl>`,
  ]
  const lastBuild = channel.lastBuildDate ?? items[0]?.pubDate
  if (lastBuild) lines.push(`    <lastBuildDate>${e(rfc822Date(lastBuild))}</lastBuildDate>`)
  if (channel.image) {
    lines.push(
      '    <image>',
      `      <url>${e(channel.image.url)}</url>`,
      `      <title>${e(channel.image.title)}</title>`,
      `      <link>${e(channel.image.link)}</link>`,
      '    </image>',
    )
  }
  for (const item of items) {
    lines.push(
      '    <item>',
      `      <title>${e(item.title)}</title>`,
      `      <link>${e(item.link)}</link>`,
      `      <guid isPermaLink="true">${e(item.link)}</guid>`,
      `      <pubDate>${e(rfc822Date(item.pubDate))}</pubDate>`,
    )
    if (item.description) lines.push(`      <description>${e(item.description)}</description>`)
    if (item.category) lines.push(`      <category>${e(item.category)}</category>`)
    if (item.author) lines.push(`      <dc:creator>${e(item.author)}</dc:creator>`)
    if (item.image) {
      const attrs = [
        `url="${e(item.image.url)}"`,
        'medium="image"',
        item.image.type ? `type="${e(item.image.type)}"` : null,
        item.image.width ? `width="${item.image.width}"` : null,
        item.image.height ? `height="${item.image.height}"` : null,
      ].filter(Boolean)
      lines.push(`      <media:content ${attrs.join(' ')}/>`)
    }
    lines.push('    </item>')
  }
  lines.push('  </channel>', '</rss>', '')
  return lines.join('\n')
}
