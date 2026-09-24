/**
 * SEO fayllari (sitemap, news sitemap, RSS, OG) uchun ma'lumotlar — Payload Local API,
 * `unstable_cache` + kesh teglari (`cache-tags.ts`): publish/unpublish'da `posts` tegi
 * yangilanadi, sitemap va lentalar ham yangilanadi.
 *
 * Build DB'ga ulanmaydi (OBLOG-31): `hasDatabase()` build fazasida `false` — bo'sh natija,
 * u keshlanmaydi; route handler'lar esa build'da chizilmaydi (`force-dynamic` / ISR).
 */
import type { Locale } from '@blog-odya/shared'
import type { Where } from 'payload'

import type { Author, Category, Media, Post } from '@/payload-types'

import { CACHE_TAGS, categoryTag } from '../cache-tags'
import { cached, hasDatabase, payloadClient } from '../data'
import { populated } from '../mappers'
import { postPath } from '../paths'
import { monthKey, monthRange, newsWindowStart } from './sitemap'

// Sitemap'da faqat ochiq (`meta.noindex` bo'lmagan) sahifalar.
type WithMeta = { meta?: { noindex?: boolean | null } | null }

function isIndexable(doc: WithMeta): boolean {
  return !doc.meta?.noindex
}

function laterDate(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null
  let bestTime = -Infinity
  for (const value of values) {
    const time = value ? Date.parse(value) : NaN
    if (Number.isFinite(time) && time > bestTime) {
      best = value!
      bestTime = time
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Sitemap: oylar (index), oylik postlar, kategoriyalar, sahifalar
// ---------------------------------------------------------------------------

export type SitemapMonth = { month: string; lastmod: string | null }

export async function loadSitemapMonths(): Promise<SitemapMonth[]> {
  if (!hasDatabase()) return []
  const payload = await payloadClient()
  const { docs } = await payload.find({
    collection: 'posts',
    locale: 'uz-Latn',
    where: { publishedAt: { exists: true } },
    sort: '-publishedAt',
    pagination: false,
    depth: 0,
    overrideAccess: false,
    select: { publishedAt: true, updatedAt: true },
  })
  const months = new Map<string, string | null>()
  for (const post of docs as Pick<Post, 'publishedAt' | 'updatedAt'>[]) {
    const key = post.publishedAt ? monthKey(post.publishedAt) : null
    if (!key) continue
    months.set(key, laterDate(months.get(key), post.updatedAt, post.publishedAt))
  }
  return [...months.entries()]
    .map(([month, lastmod]) => ({ month, lastmod }))
    .sort((a, b) => b.month.localeCompare(a.month))
}

export const getSitemapMonths = (): Promise<SitemapMonth[]> =>
  cached(loadSitemapMonths, ['seo', 'sitemap-months'], [CACHE_TAGS.posts])

/** Sitemap yozuvi: lotin (prefiksiz) yo'l + oxirgi o'zgarish. */
export type SitemapPath = { path: string; lastmod: string | null }

export async function loadSitemapPosts(month: string): Promise<SitemapPath[]> {
  const range = monthRange(month)
  if (!hasDatabase() || !range) return []
  const payload = await payloadClient()
  const { docs } = await payload.find({
    collection: 'posts',
    locale: 'uz-Latn',
    where: {
      and: [
        { publishedAt: { greater_than_equal: range.start } },
        { publishedAt: { less_than: range.end } },
      ],
    },
    sort: '-publishedAt',
    pagination: false,
    depth: 1,
    overrideAccess: false,
    select: { slug: true, category: true, publishedAt: true, updatedAt: true, meta: true },
    populate: { categories: { slug: true } },
  })
  return (docs as Post[]).flatMap((post) => {
    const category = populated<Category>(post.category)
    if (!category?.slug || !isIndexable(post)) return []
    return [
      {
        path: postPath('uz-Latn', category.slug, post.slug),
        lastmod: laterDate(post.updatedAt, post.publishedAt),
      },
    ]
  })
}

export const getSitemapPosts = (month: string): Promise<SitemapPath[]> =>
  cached(() => loadSitemapPosts(month), ['seo', 'sitemap-posts', month], [CACHE_TAGS.posts])

export async function loadSitemapCategories(): Promise<SitemapPath[]> {
  if (!hasDatabase()) return []
  const payload = await payloadClient()
  const { docs } = await payload.find({
    collection: 'categories',
    locale: 'uz-Latn',
    sort: 'order',
    pagination: false,
    depth: 0,
    overrideAccess: false,
    select: { slug: true, updatedAt: true, meta: true },
  })
  const categories = (docs as Category[]).filter(isIndexable)
  // Kategoriya sahifasi yangi post chiqqanda o'zgaradi — lastmod = eng so'nggi post.
  const latest = await Promise.all(
    categories.map((category) =>
      payload.find({
        collection: 'posts',
        locale: 'uz-Latn',
        where: { category: { equals: category.id } },
        sort: '-publishedAt',
        limit: 1,
        depth: 0,
        overrideAccess: false,
        select: { publishedAt: true },
      }),
    ),
  )
  return categories.map((category, index) => ({
    path: `/${category.slug}`,
    lastmod: laterDate(category.updatedAt, latest[index]?.docs[0]?.publishedAt),
  }))
}

export const getSitemapCategories = (): Promise<SitemapPath[]> =>
  cached(loadSitemapCategories, ['seo', 'sitemap-categories'], [CACHE_TAGS.posts, CACHE_TAGS.nav])

/** Bosh sahifa + statik sahifalar (`pages`, chop etilgan). */
export async function loadSitemapPages(): Promise<SitemapPath[]> {
  if (!hasDatabase()) return []
  const payload = await payloadClient()
  const [pages, latestPost] = await Promise.all([
    payload.find({
      collection: 'pages',
      locale: 'uz-Latn',
      pagination: false,
      depth: 0,
      overrideAccess: false,
      select: { slug: true, updatedAt: true, meta: true },
    }),
    payload.find({
      collection: 'posts',
      locale: 'uz-Latn',
      sort: '-publishedAt',
      limit: 1,
      depth: 0,
      overrideAccess: false,
      select: { publishedAt: true },
    }),
  ])
  const home: SitemapPath = { path: '/', lastmod: latestPost.docs[0]?.publishedAt ?? null }
  const staticPages = (pages.docs as Array<{ slug?: string | null; updatedAt: string } & WithMeta>)
    .filter((page) => page.slug && isIndexable(page))
    .map((page) => ({ path: `/${page.slug}`, lastmod: page.updatedAt }))
  return [home, ...staticPages]
}

export const getSitemapPages = (): Promise<SitemapPath[]> =>
  cached(loadSitemapPages, ['seo', 'sitemap-pages'], [CACHE_TAGS.posts, CACHE_TAGS.pages])

// ---------------------------------------------------------------------------
// Google News sitemap: oxirgi 48 soat, ikkala yozuv
// ---------------------------------------------------------------------------

export type NewsPost = {
  /** Lotin (prefiksiz) yo'l. */
  path: string
  publishedAt: string
  title: Record<Locale, string>
}

export async function loadNewsPosts(now: Date = new Date()): Promise<NewsPost[]> {
  if (!hasDatabase()) return []
  const payload = await payloadClient()
  const where: Where = {
    publishedAt: { greater_than_equal: newsWindowStart(now).toISOString() },
  }
  const query = (locale: Locale) =>
    payload.find({
      collection: 'posts',
      locale,
      where,
      sort: '-publishedAt',
      limit: 1000,
      depth: 1,
      overrideAccess: false,
      select: { title: true, slug: true, category: true, publishedAt: true, meta: true },
      populate: { categories: { slug: true } },
    })
  const [latin, cyrillic] = await Promise.all([query('uz-Latn'), query('uz-Cyrl')])
  const cyrillicTitles = new Map((cyrillic.docs as Post[]).map((post) => [post.id, post.title]))
  return (latin.docs as Post[]).flatMap((post) => {
    const category = populated<Category>(post.category)
    if (!category?.slug || !post.publishedAt || !isIndexable(post)) return []
    return [
      {
        path: postPath('uz-Latn', category.slug, post.slug),
        publishedAt: post.publishedAt,
        title: { 'uz-Latn': post.title, 'uz-Cyrl': cyrillicTitles.get(post.id) || post.title },
      },
    ]
  })
}

/** 48 soat oynasi render paytida yana tekshiriladi (`isWithinNewsWindow`) — kesh eskirsa ham. */
export const getNewsPosts = (): Promise<NewsPost[]> =>
  cached(() => loadNewsPosts(), ['seo', 'news-posts'], [CACHE_TAGS.posts])

// ---------------------------------------------------------------------------
// RSS
// ---------------------------------------------------------------------------

export type FeedItemData = {
  title: string
  path: string
  excerpt: string | null
  publishedAt: string
  category: string | null
  author: string | null
  cover: Pick<Media, 'url' | 'mimeType' | 'width' | 'height' | 'sizes' | 'alt'> | null
}

export type FeedData = {
  category: { slug: string; name: string; description: string | null } | null
  items: FeedItemData[]
}

export async function loadFeed(
  locale: Locale,
  categorySlug: string | null,
  limit: number,
): Promise<FeedData | null> {
  if (!hasDatabase()) return categorySlug ? null : { category: null, items: [] }
  const payload = await payloadClient()
  let category: Category | null = null
  if (categorySlug) {
    const { docs } = await payload.find({
      collection: 'categories',
      locale,
      where: { slug: { equals: categorySlug } },
      limit: 1,
      depth: 0,
      overrideAccess: false,
    })
    category = docs[0] ?? null
    if (!category) return null
  }
  const { docs } = await payload.find({
    collection: 'posts',
    locale,
    where: category ? { category: { equals: category.id } } : undefined,
    sort: '-publishedAt',
    limit,
    depth: 1,
    overrideAccess: false,
    select: {
      title: true,
      slug: true,
      excerpt: true,
      category: true,
      authors: true,
      coverImage: true,
      publishedAt: true,
      createdAt: true,
      meta: true,
    },
    populate: { categories: { name: true, slug: true }, authors: { name: true } },
  })
  const items = (docs as Post[]).flatMap((post) => {
    const postCategory = populated<Category>(post.category)
    if (!postCategory?.slug || !isIndexable(post)) return []
    const authors = (post.authors ?? []).flatMap((author) => {
      const doc = populated<Author>(author)
      return doc?.name ? [doc.name] : []
    })
    const cover = populated<Media>(post.coverImage)
    return [
      {
        title: post.title,
        path: postPath(locale, postCategory.slug, post.slug),
        excerpt: post.excerpt ?? null,
        publishedAt: post.publishedAt ?? post.createdAt,
        category: postCategory.name ?? null,
        author: authors.length > 0 ? authors.join(', ') : null,
        cover,
      },
    ]
  })
  return {
    category: category
      ? { slug: category.slug, name: category.name, description: category.description ?? null }
      : null,
    items,
  }
}

export const getFeed = (
  locale: Locale,
  categorySlug: string | null,
  limit: number,
): Promise<FeedData | null> =>
  cached(
    () => loadFeed(locale, categorySlug, limit),
    ['seo', 'feed', locale, categorySlug ?? '*', String(limit)],
    categorySlug
      ? [CACHE_TAGS.posts, CACHE_TAGS.nav, categoryTag(categorySlug)]
      : [CACHE_TAGS.posts, CACHE_TAGS.nav],
  )

// ---------------------------------------------------------------------------
// Sayt sozlamalari (bosh sahifa metadata'si, Organization.sameAs, default OG)
// ---------------------------------------------------------------------------

export type SiteSeo = {
  description: string | null
  sameAs: string[]
  defaultOgImage: Media | null
}

export async function loadSiteSeo(locale: Locale): Promise<SiteSeo> {
  if (!hasDatabase()) return { description: null, sameAs: [], defaultOgImage: null }
  const payload = await payloadClient()
  const settings = await payload.findGlobal({
    slug: 'site-settings',
    locale,
    depth: 1,
    overrideAccess: false,
  })
  return {
    description: settings.description ?? null,
    sameAs: (settings.socials ?? [])
      .map((social) => social.url?.trim())
      .filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url))),
    defaultOgImage: populated<Media>(settings.defaultOgImage),
  }
}

export const getSiteSeo = (locale: Locale): Promise<SiteSeo> =>
  cached(() => loadSiteSeo(locale), ['seo', 'site', locale], [CACHE_TAGS.nav])

// ---------------------------------------------------------------------------
// OG rasm (next/og) uchun: kategoriya nomi va rangi
// ---------------------------------------------------------------------------

export type OgCategory = { slug: string; name: string; color: string | null }

export async function loadOgCategory(locale: Locale, slug: string): Promise<OgCategory | null> {
  if (!hasDatabase()) return null
  const payload = await payloadClient()
  const { docs } = await payload.find({
    collection: 'categories',
    locale,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    select: { slug: true, name: true, color: true },
  })
  const category = docs[0] as Category | undefined
  return category
    ? { slug: category.slug, name: category.name, color: category.color ?? null }
    : null
}

export const getOgCategory = (locale: Locale, slug: string): Promise<OgCategory | null> =>
  cached(
    () => loadOgCategory(locale, slug),
    ['seo', 'og-category', locale, slug],
    [categoryTag(slug), CACHE_TAGS.nav],
  )
