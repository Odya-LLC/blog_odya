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
  LinkItem,
  NavCategory,
  PostSummary,
  TelegramLinks,
} from '@/components/blog/types'
import { env, PHASE_PRODUCTION_BUILD } from '@/env'
import type { Category, Post, Redirect } from '@/payload-types'

import { CACHE_TAGS, categoryTag, postTag } from './cache-tags'
import {
  populated,
  toCategoryRef,
  toLegalLinks,
  toNavCategories,
  toPostSummaries,
  toTelegramLinks,
} from './mappers'
import { rankRelated, RELATED_LIMIT } from './related'

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
function hasDatabase(): boolean {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return false
  return Boolean(env.DATABASE_URL)
}

/**
 * `unstable_cache` o'rami: kalit deploy versiyasi bilan, teglar bilan. DB'siz holatdagi (build,
 * sirlarsiz muhit) bo'sh natija keshlanmaydi — aks holda u runtime'da ham qaytarilardi.
 */
function cached<T>(load: () => Promise<T>, keyParts: string[], tags: string[]): Promise<T> {
  if (!hasDatabase()) return load()
  return unstable_cache(load, [CACHE_VERSION, ...keyParts], {
    tags,
    revalidate: REVALIDATE_SECONDS,
  })()
}

const payloadClient = cache(async () => getPayload({ config }))

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
  categories: NavCategory[]
  legalLinks: LinkItem[]
  telegram: TelegramLinks
}

const EMPTY_CHROME = (): SiteChrome => ({
  categories: [],
  legalLinks: [],
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
    telegram: toTelegramLinks(settings, env),
  }
}

export const getSiteChrome = (locale: Locale): Promise<SiteChrome> =>
  cached(() => loadSiteChrome(locale), ['site-chrome', locale], [CACHE_TAGS.nav])

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
