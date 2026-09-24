/**
 * SEO fayllari (route handler'lar uchun): sitemap index, oylik/kategoriya/sahifa sitemap'lari,
 * Google News sitemap, RSS lentalari. Ma'lumot — `./data.ts` (kesh teglari bilan), XML —
 * `./sitemap.ts` va `./rss.ts` (yon ta'sirsiz, testlangan).
 *
 * Route handler'lar `force-dynamic`: build'da chizilmaydi (DB'ga ulanmaydi, OBLOG-31); DB so'rovi
 * `unstable_cache` bilan (publish'da teg bo'yicha yangilanadi), javob esa CDN'da qisqa muddat
 * keshlanadi (`Cache-Control: s-maxage`).
 */
import type { Locale } from '@blog-odya/shared'

import { getSiteStrings } from '@/i18n/site'

import { categoryPath, homePath } from '../paths'
import {
  absoluteUrl,
  BRAND_NAME,
  isIndexingAllowed,
  NEWS_LANGUAGE,
  NEWS_PUBLICATION_NAME,
  ORGANIZATION,
  siteOrigin,
} from './config'
import {
  getFeed,
  getNewsPosts,
  getSitemapCategories,
  getSitemapMonths,
  getSitemapPages,
  getSitemapPosts,
  type SitemapPath,
} from './data'
import { hreflangUrls, mediaOgImage } from './metadata'
import { NOINDEX_HEADER } from './robots'
import { feedPath, RSS_CONTENT_TYPE, RSS_ITEMS_LIMIT, rssXml } from './rss'
import {
  isWithinNewsWindow,
  localizedSitemapUrls,
  newsSitemapXml,
  type SitemapFile,
  sitemapFileUrl,
  sitemapIndexXml,
  urlsetXml,
  w3cDate,
  XML_CONTENT_TYPE,
} from './sitemap'

/** CDN keshi (soniya): sitemap/RSS — 5 daqiqa, keyin fonda yangilanadi. */
export const SEO_FILE_CACHE_SECONDS = 300

export function seoFileResponse(
  body: string,
  contentType: string,
  cacheSeconds: number = SEO_FILE_CACHE_SECONDS,
): Response {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 12}`,
  }
  if (!isIndexingAllowed()) headers[NOINDEX_HEADER.key] = NOINDEX_HEADER.value
  return new Response(body, { headers })
}

export function notFoundResponse(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function latest(values: Array<string | null | undefined>): string | undefined {
  const times = values
    .map((value) => (value ? Date.parse(value) : NaN))
    .filter((time) => Number.isFinite(time))
  return times.length > 0 ? new Date(Math.max(...times)).toISOString() : undefined
}

function toUrls(entries: SitemapPath[], origin: string) {
  return entries.flatMap((entry) => localizedSitemapUrls(entry.path, entry.lastmod, origin))
}

/** `/sitemap.xml` — sahifalar, kategoriyalar, oylik post sitemap'lari (eng yangisi birinchi). */
export async function renderSitemapIndex(origin: string = siteOrigin()): Promise<string> {
  const [months, pages, categories] = await Promise.all([
    getSitemapMonths(),
    getSitemapPages(),
    getSitemapCategories(),
  ])
  const files: Array<{ file: SitemapFile; lastmod?: string }> = [
    { file: { kind: 'pages' }, lastmod: latest(pages.map((page) => page.lastmod)) },
    {
      file: { kind: 'categories' },
      lastmod: latest(categories.map((category) => category.lastmod)),
    },
    ...months.map((month) => ({
      file: { kind: 'posts' as const, month: month.month },
      lastmod: w3cDate(month.lastmod),
    })),
  ]
  return sitemapIndexXml(
    files.map(({ file, lastmod }) => ({
      loc: sitemapFileUrl(file, origin),
      ...(lastmod ? { lastmod } : {}),
    })),
  )
}

/** `/sitemaps/{pages|categories|posts-YYYY-MM}.xml`. Noma'lum oy — bo'sh `urlset` emas, 404. */
export async function renderSitemapFile(
  file: Exclude<SitemapFile, { kind: 'index' } | { kind: 'news' }>,
  origin: string = siteOrigin(),
): Promise<string | null> {
  switch (file.kind) {
    case 'pages':
      return urlsetXml(toUrls(await getSitemapPages(), origin))
    case 'categories':
      return urlsetXml(toUrls(await getSitemapCategories(), origin))
    case 'posts': {
      const posts = await getSitemapPosts(file.month)
      return posts.length > 0 ? urlsetXml(toUrls(posts, origin)) : null
    }
  }
}

/** `/news-sitemap.xml` — oxirgi 48 soat, har bir post ikkala yozuvda. */
export async function renderNewsSitemap(
  now: Date = new Date(),
  origin: string = siteOrigin(),
): Promise<string> {
  const posts = (await getNewsPosts()).filter((post) => isWithinNewsWindow(post.publishedAt, now))
  const urls = posts.flatMap((post) => {
    const alternates = hreflangUrls(post.path, origin)
    const publicationDate = w3cDate(post.publishedAt) ?? post.publishedAt
    return (['uz-Latn', 'uz-Cyrl'] as const).map((locale) => ({
      loc: alternates[locale],
      title: post.title[locale],
      publicationDate,
      publicationName: NEWS_PUBLICATION_NAME,
      language: NEWS_LANGUAGE,
      alternates,
    }))
  })
  return newsSitemapXml(urls)
}

/** RSS: `/rss.xml`, `/kr/rss.xml`, `/{category}/rss.xml`, `/kr/{category}/rss.xml`. */
export async function renderFeed(
  locale: Locale,
  categorySlug: string | null,
  origin: string = siteOrigin(),
): Promise<string | null> {
  const feed = await getFeed(locale, categorySlug, RSS_ITEMS_LIMIT)
  if (!feed) return null
  const t = getSiteStrings(locale)
  const brand = BRAND_NAME[locale]
  const channelPath = feed.category ? categoryPath(locale, feed.category.slug) : homePath(locale)
  return rssXml(
    {
      title: feed.category ? `${feed.category.name} — ${brand}` : brand,
      link: absoluteUrl(channelPath, origin),
      selfUrl: absoluteUrl(feedPath(locale, feed.category?.slug), origin),
      description: feed.category?.description || t.tagline,
      language: locale,
      image: {
        url: absoluteUrl(ORGANIZATION.logoPath, origin),
        title: brand,
        link: absoluteUrl(channelPath, origin),
      },
    },
    feed.items.map((item) => {
      const image = mediaOgImage(item.cover, origin)
      return {
        title: item.title,
        link: absoluteUrl(item.path, origin),
        description: item.excerpt,
        pubDate: item.publishedAt,
        category: item.category,
        author: item.author,
        image: image
          ? { url: image.url, type: image.type, width: image.width, height: image.height }
          : null,
      }
    }),
  )
}

export { RSS_CONTENT_TYPE, XML_CONTENT_TYPE }
