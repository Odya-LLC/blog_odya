/**
 * Ommaviy sayt ma'lumotlari — Payload Local API (RSC ichida, HTTP'siz), ISR keshi bilan
 * (TZ §3.1, §8.4). Har bir so'rov `unstable_cache` bilan `cache-tags.ts` teglari ostida
 * keshlanadi; Payload hook'lari publish/unpublish'da shu teglarni yangilaydi (`revalidate.ts`).
 *
 * Kirish huquqi: `overrideAccess: false` + foydalanuvchisiz — kolleksiya `read` qoidalari
 * qo'llanadi (postlar: faqat chop etilgan va arxivlanmagan, TZ §4.1). Qoralamalar ko'rinmaydi.
 *
 * Kirill (`uz-Cyrl`) maydoni bo'sh bo'lsa, Payload `fallback: true` bilan lotin qiymatini
 * qaytaradi (kirill sinxronlash hook'i — OBLOG-29).
 */
import type { Locale } from '@blog-odya/shared'
import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload, type Where } from 'payload'
import { cache } from 'react'

import type {
  CategoryRef,
  FooterColumn,
  ImageRef,
  LinkItem,
  NavCategory,
  PostSummary,
  TagRef,
  TelegramLinks,
} from '@/components/blog/types'
import { env, PHASE_PRODUCTION_BUILD } from '@/env'
import type { Author, Category, Media, Page, Post, Redirect } from '@/payload-types'

import { CACHE_TAGS, categoryTag, postTag } from './cache-tags'
import {
  populated,
  toCategoryRef,
  toFooterColumns,
  toImageRef,
  toLegalLinks,
  toNavCategories,
  toPostSummaries,
  toTagRef,
  toTelegramLinks,
} from './mappers'
import { authorPath } from './paths'
import { rankRelated, RELATED_LIMIT } from './related'
import type { SearchQuery } from './search/normalize'
import { searchPostIds } from './search/query'

/** Sahifalar keshining zaxira muddati (soniya) — teg bo'yicha yangilanmay qolgan holatlar uchun. */
export const REVALIDATE_SECONDS = 3600

/**
 * Kesh kaliti versiyasi: Vercel Data Cache deploy'lar orasida saqlanadi, keshda esa kod
 * tayyorlagan ko'rinish modeli turadi — har bir deploy o'z kaliti bilan (eski shakl qolmaydi).
 */
const CACHE_VERSION =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'

/** Kategoriya sahifasidagi postlar soni. */
export const CATEGORY_PAGE_SIZE = 12

/** Bosh sahifadagi kategoriya bloklari soni va har biridagi postlar. */
const HOME_CATEGORY_BLOCKS = 4
const HOME_BLOCK_POSTS = 5
const HOME_LATEST = 10

/**
 * DB'ga murojaat qilinmaydigan holatlar (OBLOG-31):
 * - `next build` — sahifalar oldindan chizilmaydi, lekin `/_not-found` kabi statik sahifalar
 *   karkas (menyu) so'rashi mumkin — build DB'ga ulanmaydi;
 * - DB sozlanmagan muhit (sirlarsiz Vercel Preview) — xato o'rniga bo'sh holat.
 */
export function hasDatabase(): boolean {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return false
  return Boolean(env.DATABASE_URL)
}

/**
 * `unstable_cache` o'rami: kalit deploy versiyasi bilan, teglar bilan. DB'siz holatdagi (build,
 * sirlarsiz muhit) bo'sh natija keshlanmaydi — aks holda u runtime'da ham qaytarilardi.
 */
export function cached<T>(load: () => Promise<T>, keyParts: string[], tags: string[]): Promise<T> {
  if (!hasDatabase()) return load()
  return unstable_cache(load, [CACHE_VERSION, ...keyParts], {
    tags,
    revalidate: REVALIDATE_SECONDS,
  })()
}

export const payloadClient = cache(async () => getPayload({ config }))

/** Kartochka uchun kerakli maydonlar (`content` — faqat o'qish vaqti yo'q bo'lsa kerak). */
const POST_CARD_SELECT = {
  title: true,
  slug: true,
  excerpt: true,
  coverImage: true,
  category: true,
  publishedAt: true,
  createdAt: true,
  readingTime: true,
  isBreaking: true,
  isFeatured: true,
} as const

async function findPosts(
  locale: Locale,
  where: Where | undefined,
  limit: number,
  page = 1,
): Promise<{ docs: Post[]; totalPages: number; totalDocs: number }> {
  const payload = await payloadClient()
  const result = await payload.find({
    collection: 'posts',
    locale,
    where,
    sort: '-publishedAt',
    limit,
    page,
    depth: 1,
    overrideAccess: false,
    select: POST_CARD_SELECT,
    populate: {
      categories: { name: true, slug: true },
    },
  })
  return {
    docs: result.docs as Post[],
    totalPages: result.totalPages,
    totalDocs: result.totalDocs,
  }
}

// ---------------------------------------------------------------------------
// Karkas (header/footer)
// ---------------------------------------------------------------------------

export type SiteChrome = {
  /** Header menyusi (`header` global: kategoriya, sahifa, URL havolalari; bo'sh — kategoriyalar). */
  categories: NavCategory[]
  legalLinks: LinkItem[]
  /** Footer ustunlari (`footer` global). */
  footerColumns: FooterColumn[]
  copyright: string | null
  telegram: TelegramLinks
}

const EMPTY_CHROME = (): SiteChrome => ({
  categories: [],
  legalLinks: [],
  footerColumns: [],
  copyright: null,
  telegram: toTelegramLinks(null, env),
})

export async function loadSiteChrome(locale: Locale): Promise<SiteChrome> {
  if (!hasDatabase()) return EMPTY_CHROME()
  const payload = await payloadClient()
  const [categories, header, footer, settings] = await Promise.all([
    payload.find({
      collection: 'categories',
      locale,
      limit: 100,
      depth: 0,
      sort: 'order',
      overrideAccess: false,
      pagination: false,
    }),
    payload.findGlobal({ slug: 'header', locale, depth: 1, overrideAccess: false }),
    payload.findGlobal({ slug: 'footer', locale, depth: 1, overrideAccess: false }),
    payload.findGlobal({ slug: 'site-settings', locale, depth: 0, overrideAccess: false }),
  ])
  return {
    categories: toNavCategories(header, categories.docs, locale),
    legalLinks: toLegalLinks(footer, locale),
    footerColumns: toFooterColumns(footer, locale),
    copyright: footer.copyright ?? null,
    telegram: toTelegramLinks(settings, env),
  }
}

export const getSiteChrome = (locale: Locale): Promise<SiteChrome> =>
  // `pages` — menyudagi sahifa slug'i o'zgarsa havola ham yangilanadi.
  cached(() => loadSiteChrome(locale), ['site-chrome', locale], [CACHE_TAGS.nav, CACHE_TAGS.pages])

// ---------------------------------------------------------------------------
// Bosh sahifa
// ---------------------------------------------------------------------------

export type HomeData = {
  main: PostSummary | null
  secondary: PostSummary[]
  latest: PostSummary[]
  blocks: Array<{ category: CategoryRef; posts: PostSummary[] }>
}

export async function loadHomeData(locale: Locale): Promise<HomeData> {
  if (!hasDatabase()) return { main: null, secondary: [], latest: [], blocks: [] }
  const payload = await payloadClient()
  const [latestResult, featuredResult, categories] = await Promise.all([
    findPosts(locale, undefined, HOME_LATEST),
    findPosts(locale, { isFeatured: { equals: true } }, 1),
    payload.find({
      collection: 'categories',
      locale,
      where: { isInMenu: { equals: true } },
      sort: 'order',
      limit: HOME_CATEGORY_BLOCKS * 2,
      depth: 0,
      overrideAccess: false,
      pagination: false,
    }),
  ])
  const latest = toPostSummaries(latestResult.docs, locale)
  const featured = toPostSummaries(featuredResult.docs, locale)[0] ?? null
  const main = featured ?? latest[0] ?? null
  const secondary = latest.filter((post) => post.id !== main?.id).slice(0, 4)

  const blockResults = await Promise.all(
    categories.docs.map(async (category) => ({
      category,
      posts: await findPosts(locale, { category: { equals: category.id } }, HOME_BLOCK_POSTS),
    })),
  )
  const blocks = blockResults
    .filter(({ posts }) => posts.docs.length > 0)
    .slice(0, HOME_CATEGORY_BLOCKS)
    .map(({ category, posts }) => ({
      category: toCategoryRef(category, locale),
      posts: toPostSummaries(posts.docs, locale),
    }))

  return { main, secondary, latest, blocks }
}

export const getHomeData = (locale: Locale): Promise<HomeData> =>
  cached(
    () => loadHomeData(locale),
    ['home', locale],
    [CACHE_TAGS.home, CACHE_TAGS.posts, CACHE_TAGS.nav],
  )

// ---------------------------------------------------------------------------
// Kategoriya
// ---------------------------------------------------------------------------

export type CategoryPageData = {
  category: CategoryRef & {
    description: string | null
    metaTitle: string | null
    metaDescription: string | null
    /** `meta.noindex` (plugin-seo) — sahifa `noindex`, sitemap'ga kirmaydi (M1-06). */
    noindex: boolean
    updatedAt: string
  }
  posts: PostSummary[]
  page: number
  totalPages: number
  latest: PostSummary[]
}

export async function loadCategoryPage(
  locale: Locale,
  slug: string,
  page: number,
): Promise<CategoryPageData | null> {
  if (!hasDatabase()) return null
  const payload = await payloadClient()
  const { docs } = await payload.find({
    collection: 'categories',
    locale,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: false,
  })
  const category = docs[0]
  if (!category) return null
  const [list, latest] = await Promise.all([
    findPosts(locale, { category: { equals: category.id } }, CATEGORY_PAGE_SIZE, page),
    findPosts(locale, { category: { not_equals: category.id } }, 6),
  ])
  // `page` > oxirgi sahifa — 404 (1-sahifa bo'sh bo'lsa ham ko'rsatiladi: bo'sh holat).
  if (page > 1 && page > list.totalPages) return null
  return {
    category: {
      ...toCategoryRef(category, locale),
      description: category.description ?? null,
      metaTitle: category.meta?.title ?? null,
      metaDescription: category.meta?.description ?? null,
      noindex: Boolean(category.meta?.noindex),
      updatedAt: category.updatedAt,
    },
    posts: toPostSummaries(list.docs, locale),
    page,
    totalPages: Math.max(1, list.totalPages),
    latest: toPostSummaries(latest.docs, locale),
  }
}

export const getCategoryPage = (
  locale: Locale,
  slug: string,
  page: number,
): Promise<CategoryPageData | null> =>
  cached(
    () => loadCategoryPage(locale, slug, page),
    ['category', locale, slug, String(page)],
    [categoryTag(slug), CACHE_TAGS.posts, CACHE_TAGS.nav],
  )

// ---------------------------------------------------------------------------
// Teg va muallif sahifalari (TZ §8.1: `/tag/{slug}`, `/author/{slug}`, sahifalash bilan)
// ---------------------------------------------------------------------------

/** Teg/muallif sahifasidagi postlar soni (kategoriya bilan bir xil). */
export const LISTING_PAGE_SIZE = CATEGORY_PAGE_SIZE

export type ListingPosts = {
  posts: PostSummary[]
  page: number
  totalPages: number
  /** Jami postlar (teg `noindex` qoidasi: < 3 — TZ §8.1). */
  totalDocs: number
  latest: PostSummary[]
}

type SeoFields = {
  description: string | null
  metaTitle: string | null
  metaDescription: string | null
  noindex: boolean
  updatedAt: string
}

export type TagPageData = ListingPosts & { tag: TagRef & SeoFields }

/** Ro'yxat + yon panel ("So'nggi yangiliklar"); `page` > oxirgi sahifa — `null` (404). */
async function loadListingPosts(
  locale: Locale,
  where: Where,
  page: number,
): Promise<ListingPosts | null> {
  const [list, latest] = await Promise.all([
    findPosts(locale, where, LISTING_PAGE_SIZE, page),
    findPosts(locale, undefined, 6),
  ])
  if (page > 1 && page > list.totalPages) return null
  const posts = toPostSummaries(list.docs, locale)
  const shown = new Set(posts.map((post) => post.id))
  return {
    posts,
    page,
    totalPages: Math.max(1, list.totalPages),
    totalDocs: list.totalDocs,
    latest: toPostSummaries(latest.docs, locale).filter((post) => !shown.has(post.id)),
  }
}

export async function loadTagPage(
  locale: Locale,
  slug: string,
  page: number,
): Promise<TagPageData | null> {
  if (!hasDatabase()) return null
  const payload = await payloadClient()
  const { docs } = await payload.find({
    collection: 'tags',
    locale,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: false,
  })
  const tag = docs[0]
  if (!tag) return null
  const listing = await loadListingPosts(locale, { tags: { in: [tag.id] } }, page)
  if (!listing) return null
  return {
    ...listing,
    tag: {
      ...toTagRef(tag, locale),
      description: tag.description ?? null,
      metaTitle: tag.meta?.title ?? null,
      metaDescription: tag.meta?.description ?? null,
      noindex: Boolean(tag.meta?.noindex),
      updatedAt: tag.updatedAt,
    },
  }
}

export const getTagPage = (locale: Locale, slug: string, page: number) =>
  cached(
    () => loadTagPage(locale, slug, page),
    ['tag', locale, slug, String(page)],
    [CACHE_TAGS.posts, CACHE_TAGS.nav],
  )

export type AuthorProfile = {
  slug: string
  name: string
  href: string
  position: string | null
  bio: string | null
  avatar: ImageRef | null
  /** Rasm to'liq URL uchun (JSON-LD `Person.image`). */
  avatarUrl: string | null
  socials: Array<{ platform: string; url: string }>
  updatedAt: string
}

export type AuthorPageData = ListingPosts & { author: AuthorProfile }

export async function loadAuthorPage(
  locale: Locale,
  slug: string,
  page: number,
): Promise<AuthorPageData | null> {
  if (!hasDatabase()) return null
  const payload = await payloadClient()
  const { docs } = await payload.find({
    collection: 'authors',
    locale,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
    overrideAccess: false,
  })
  const author = docs[0] as Author | undefined
  if (!author) return null
  const listing = await loadListingPosts(locale, { authors: { in: [author.id] } }, page)
  if (!listing) return null
  const avatar = populated<Media>(author.avatar)
  return {
    ...listing,
    author: {
      slug: author.slug,
      name: author.name,
      href: authorPath(locale, author.slug),
      position: author.position ?? null,
      bio: author.bio ?? null,
      avatar: toImageRef(avatar),
      avatarUrl: avatar?.url ?? null,
      socials: (author.socials ?? [])
        .filter((social) => /^https?:\/\//i.test(social.url))
        .map((social) => ({ platform: social.platform, url: social.url })),
      updatedAt: author.updatedAt,
    },
  }
}

export const getAuthorPage = (locale: Locale, slug: string, page: number) =>
  cached(
    () => loadAuthorPage(locale, slug, page),
    ['author', locale, slug, String(page)],
    [CACHE_TAGS.posts, CACHE_TAGS.nav],
  )

// ---------------------------------------------------------------------------
// Statik sahifalar (`pages`, TZ §10.13): `/{slug}` — faqat chop etilganlari
// ---------------------------------------------------------------------------

export async function loadStaticPage(locale: Locale, slug: string): Promise<Page | null> {
  if (!hasDatabase()) return null
  const payload = await payloadClient()
  const { docs } = await payload.find({
    collection: 'pages',
    locale,
    where: { slug: { equals: slug } },
    limit: 1,
    // 2: matndagi rasmlar va ichki havolalar (post → kategoriya).
    depth: 2,
    overrideAccess: false,
  })
  return (docs[0] as Page | undefined) ?? null
}

export const getStaticPage = (locale: Locale, slug: string): Promise<Page | null> =>
  cached(() => loadStaticPage(locale, slug), ['page', locale, slug], [CACHE_TAGS.pages])

// ---------------------------------------------------------------------------
// Qidiruv (`/search?q=`) — Postgres FTS (`search/query.ts`). Keshlanmaydi: so'rovlar cheksiz
// ko'p va foydalanuvchi kiritadi (Data Cache'ni to'ldirmaslik uchun); sahifa `noindex`.
// ---------------------------------------------------------------------------

export const SEARCH_PAGE_SIZE = 10

export type SearchResults = {
  posts: PostSummary[]
  page: number
  totalPages: number
  total: number
}

export async function loadSearchResults(
  locale: Locale,
  query: SearchQuery,
  page: number,
): Promise<SearchResults> {
  const empty: SearchResults = { posts: [], page, totalPages: 1, total: 0 }
  if (!hasDatabase()) return empty
  const payload = await payloadClient()
  const hits = await searchPostIds(payload, query, {
    limit: SEARCH_PAGE_SIZE,
    offset: (page - 1) * SEARCH_PAGE_SIZE,
  })
  if (hits.ids.length === 0) return { ...empty, total: hits.total }
  // Kartochkalar — Local API orqali (kirish qoidalari yana qo'llanadi), FTS tartibida.
  const result = await payload.find({
    collection: 'posts',
    locale,
    where: { id: { in: hits.ids } },
    limit: hits.ids.length,
    depth: 1,
    overrideAccess: false,
    select: POST_CARD_SELECT,
    populate: { categories: { name: true, slug: true } },
  })
  const byId = new Map((result.docs as Post[]).map((doc) => [doc.id, doc]))
  const ordered = hits.ids.flatMap((id) => byId.get(id) ?? [])
  return {
    posts: toPostSummaries(ordered, locale),
    page,
    totalPages: Math.max(1, Math.ceil(hits.total / SEARCH_PAGE_SIZE)),
    total: hits.total,
  }
}

// ---------------------------------------------------------------------------
// Maqola
// ---------------------------------------------------------------------------

export type ArticleData = {
  post: Post
  category: Category
  related: PostSummary[]
}

export async function loadArticle(locale: Locale, slug: string): Promise<ArticleData | null> {
  if (!hasDatabase()) return null
  const payload = await payloadClient()
  const { docs } = await payload.find({
    collection: 'posts',
    locale,
    where: { slug: { equals: slug } },
    limit: 1,
    // 2: muqova, kategoriya, teglar, mualliflar va matndagi rasmlar (upload tugunlari).
    depth: 2,
    overrideAccess: false,
  })
  const post = docs[0]
  const category = post ? populated<Category>(post.category) : null
  if (!post || !category) return null
  return { post, category, related: await findRelated(locale, post, category) }
}

export const getArticle = (locale: Locale, slug: string): Promise<ArticleData | null> =>
  cached(
    () => loadArticle(locale, slug),
    ['article', locale, slug],
    [postTag(slug), CACHE_TAGS.posts, CACHE_TAGS.nav],
  )

function relationId(value: unknown): number | string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return (value as { id?: number | string }).id ?? null
  return value as number | string
}

/** Muharrir tanlagani + teg/kategoriya kesishmasi (`related.ts`). */
async function findRelated(locale: Locale, post: Post, category: Category): Promise<PostSummary[]> {
  const tagIds = (post.tags ?? []).map(relationId).filter((id) => id !== null)
  const manualIds = (post.relatedPosts ?? []).map(relationId).filter((id) => id !== null)
  const or: Where[] = [{ category: { equals: category.id } }]
  if (tagIds.length > 0) or.push({ tags: { in: tagIds } })
  if (manualIds.length > 0) or.push({ id: { in: manualIds } })

  const payload = await payloadClient()
  const result = await payload.find({
    collection: 'posts',
    locale,
    where: { and: [{ id: { not_equals: post.id } }, { or }] },
    sort: '-publishedAt',
    limit: 30,
    depth: 1,
    overrideAccess: false,
    select: { ...POST_CARD_SELECT, tags: true },
    populate: { categories: { name: true, slug: true } },
  })
  const candidates = result.docs as Post[]
  const ranked = rankRelated(
    { id: post.id, categoryId: category.id, tagIds },
    candidates.map((candidate) => ({
      id: candidate.id,
      categoryId: relationId(candidate.category),
      tagIds: (candidate.tags ?? []).map(relationId).filter((id) => id !== null),
      publishedAt: candidate.publishedAt ?? candidate.createdAt,
    })),
    manualIds,
    RELATED_LIMIT,
  )
  const byId = new Map(candidates.map((candidate) => [String(candidate.id), candidate]))
  return toPostSummaries(
    ranked.flatMap((id) => byId.get(String(id)) ?? []),
    locale,
  )
}

// ---------------------------------------------------------------------------
// Yo'naltirishlar (plugin-redirects): eski slug → yangi URL (slug'ni o'zgartirganda 301 —
// avtomatik yozuvlar OBLOG-29 da; admin'dan qo'lda qo'shilganlari hozir ham ishlaydi).
// ---------------------------------------------------------------------------

export type RedirectTarget = { to: string; permanent: boolean }

/** `from` — lotin (prefiksiz) yo'l, masalan `/texnologiyalar/eski-slug`. */
export async function loadRedirect(from: string): Promise<RedirectTarget | null> {
  if (!hasDatabase()) return null
  const payload = await payloadClient()
  const variants = from.endsWith('/') ? [from, from.slice(0, -1)] : [from, `${from}/`]
  const { docs } = await payload.find({
    collection: 'redirects',
    where: { from: { in: variants } },
    limit: 1,
    depth: 2,
    overrideAccess: false,
  })
  const redirect = docs[0] as Redirect | undefined
  const to = redirect ? redirectTargetPath(redirect) : null
  return to && to !== from ? { to, permanent: redirect?.type !== '302' } : null
}

export const findRedirect = (from: string): Promise<RedirectTarget | null> =>
  cached(() => loadRedirect(from), ['redirect', from], [CACHE_TAGS.redirects])

/** Redirect maqsadi — lotin (prefiksiz) yo'l yoki tashqi URL. */
export function redirectTargetPath(redirect: Pick<Redirect, 'to'>): string | null {
  const to = redirect.to
  if (!to) return null
  if (to.type === 'custom') return to.url || null
  const reference = to.reference
  if (!reference) return null
  const doc = populated<{ slug?: string | null; category?: unknown }>(reference.value)
  if (!doc?.slug) return null
  switch (reference.relationTo) {
    case 'posts': {
      const category = populated<{ slug?: string | null }>(doc.category as never)
      return category?.slug ? `/${category.slug}/${doc.slug}` : null
    }
    case 'categories':
    case 'pages':
      return `/${doc.slug}`
    case 'tags':
      return `/tag/${doc.slug}`
    default:
      return null
  }
}
