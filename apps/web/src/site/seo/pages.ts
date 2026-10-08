/**
 * Sahifa turlari bo'yicha SEO (TZ §8.2): Payload ko'rinish ma'lumotlari → Next.js `Metadata` va
 * JSON-LD. Maqola, kategoriya, bosh sahifa (M1-06); teg, muallif, statik sahifa, qidiruv — M1-07
 * shu yerdagi quruvchilar (`buildPageMetadata`, `tagRobots`, `personJsonLd`, `faqPageJsonLd`)
 * bilan qo'shadi.
 *
 * Yon ta'sirsiz — unit testlanadi.
 */
import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'

import { DEFAULT_AUTHOR } from '@/collections/Posts/defaultAuthor'
import { getSiteStrings } from '@/i18n/site'
import { lexicalToPlainText } from '@/lib/lexical'
import { NEWS_IMAGE_SIZES } from '@/lib/media-image'
import { showViewCount } from '@/pageviews/beacon'
import type { Author, Category, Media, Page, Post, Tag } from '@/payload-types'

import { populated, postDate, toSourceRefs } from '../mappers'
import {
  archivePath,
  authorPath,
  categoryPath,
  homePath,
  pagePath,
  postPath,
  searchPath,
  tagPath,
} from '../paths'
import {
  absoluteUrl,
  BRAND_ICONS,
  BRAND_NAME,
  isIndexingAllowed,
  OG_LOCALE,
  siteOrigin,
} from './config'
import {
  breadcrumbJsonLd,
  type FaqItem,
  faqPageJsonLd,
  type ItemListEntry,
  itemListJsonLd,
  type JsonLdObject,
  newsArticleJsonLd,
  organizationJsonLd,
  type PersonInput,
  personJsonLd,
  websiteJsonLd,
} from './json-ld'
import {
  buildPageMetadata,
  generatedOgImage,
  isTagIndexable,
  mediaOgImage,
  type SeoImage,
  versionToken,
  withoutBrand,
} from './metadata'
import { feedPath } from './rss'

export type PageSeo = { metadata: Metadata; jsonLd: JsonLdObject[] }

type Options = { origin?: string; indexingAllowed?: boolean }

function feedFor(locale: Locale, categorySlug?: string, categoryName?: string) {
  const brand = BRAND_NAME[locale]
  return {
    path: feedPath(locale, categorySlug),
    title: categoryName ? `${categoryName} — ${brand}` : brand,
  }
}

// ---------------------------------------------------------------------------
// Maqola
// ---------------------------------------------------------------------------

export type ArticleSeoInput = {
  post: Post
  category: Category
  /** Jami ko'rishlar (OBLOG-72, sahifadagi bilan bir xil keshlangan qiymat) → `interactionStatistic`. */
  views?: number | null
}

/**
 * JSON-LD mualliflari. Muallif bo'lmasa (eski postlar, standart muallif hujjati hali yo'q) —
 * standart muallif (`Person`, `/author/tahririyat`): Google News/Discover `author` sifatida
 * `Organization` emas, `Person` kutadi (OBLOG-57).
 */
function authorPersons(post: Post, locale: Locale, origin: string): PersonInput[] {
  const persons = postAuthorPersons(post, locale, origin)
  if (persons.length > 0) return persons
  return [
    {
      name: DEFAULT_AUTHOR.name[locale],
      path: authorPath(locale, DEFAULT_AUTHOR.slug),
      jobTitle: DEFAULT_AUTHOR.position[locale],
    },
  ]
}

function postAuthorPersons(post: Post, locale: Locale, origin: string): PersonInput[] {
  return (post.authors ?? []).flatMap((author) => {
    const doc = populated<Author>(author)
    if (!doc?.name) return []
    const avatar = populated<Media>(doc.avatar)
    return [
      {
        name: doc.name,
        path: doc.slug ? authorPath(locale, doc.slug) : null,
        jobTitle: doc.position ?? null,
        image: avatar?.url ? absoluteUrl(avatar.url, origin) : null,
        sameAs: (doc.socials ?? []).map((social) => social.url),
      },
    ]
  })
}

/**
 * Google News/Discover variantlari (16:9, 4:3, 1:1, ≥ 1200 px) — faqat mavjudlari (eski rasmlarda
 * `media:regenerate` ishlatilmaguncha bo'lmasligi mumkin), to'liq URL.
 */
function newsImageUrls(media: Media | null | undefined, origin: string): string[] {
  return NEWS_IMAGE_SIZES.flatMap(({ name, width }) => {
    const size = media?.sizes?.[name]
    return size?.url && size.width && size.width >= width ? [absoluteUrl(size.url, origin)] : []
  })
}

/**
 * Maqola rasmlari: og:image — `meta.image` → muqova → avtomatik OG (`next/og`). JSON-LD `image`
 * (OBLOG-57) — avval News/Discover nisbatlari (16:9, 4:3, 1:1), keyin asl muqova va OG (1200×630).
 */
export function articleImages(
  locale: Locale,
  post: Post,
  origin: string = siteOrigin(),
): { og: SeoImage; jsonLd: string[] } {
  const title = post.title
  const metaMedia = populated<Media>(post.meta?.image)
  const metaImage = mediaOgImage(metaMedia, origin)
  const cover = populated<Media>(post.coverImage)
  const coverOg = mediaOgImage(cover, origin)
  const generated = generatedOgImage(
    locale,
    { kind: 'post', slug: post.slug },
    title,
    versionToken(post.updatedAt),
    origin,
  )
  const og = metaImage ?? coverOg ?? generated
  const jsonLd = cover
    ? [
        ...newsImageUrls(cover, origin),
        ...(cover.url ? [absoluteUrl(cover.url, origin)] : []),
        ...(coverOg ? [coverOg.url] : []),
        ...(metaImage ? [...newsImageUrls(metaMedia, origin), metaImage.url] : []),
      ]
    : [...newsImageUrls(metaMedia, origin), og.url]
  return { og: { ...og, alt: og.alt || title }, jsonLd: [...new Set(jsonLd)] }
}

export function articleSeo(
  locale: Locale,
  { post, category, views }: ArticleSeoInput,
  options: Options = {},
): PageSeo {
  const origin = options.origin ?? siteOrigin()
  const t = getSiteStrings(locale)
  const path = postPath(locale, category.slug, post.slug)
  const description = post.meta?.description || post.excerpt || null
  const images = articleImages(locale, post, origin)
  const persons = authorPersons(post, locale, origin)
  const tags = (post.tags ?? []).flatMap((tag) => {
    const doc = populated<Tag>(tag)
    return doc?.name ? [doc.name] : []
  })
  const published = postDate(post)
  const modified = post.updatedAt || published

  const metadata = buildPageMetadata({
    locale,
    path,
    title: post.meta?.title || post.title,
    description,
    image: images.og,
    type: 'article',
    noindex: post.meta?.noindex,
    article: {
      publishedTime: published,
      modifiedTime: modified,
      section: category.name,
      tags,
      authors: persons.flatMap((person) => (person.path ? [absoluteUrl(person.path, origin)] : [])),
    },
    feed: feedFor(locale),
    origin,
    indexingAllowed: options.indexingAllowed,
  })

  const jsonLd = [
    newsArticleJsonLd({
      locale,
      path,
      headline: post.title,
      description,
      images: images.jsonLd,
      datePublished: published,
      dateModified: modified,
      authors: persons,
      section: category.name,
      keywords: tags,
      sources: toSourceRefs(post.sources).map((source) => source.url),
      readCount: showViewCount(views) ? views : null,
      origin,
    }),
    breadcrumbJsonLd(
      [
        { name: t.home, path: homePath(locale) },
        { name: category.name, path: categoryPath(locale, category.slug) },
        { name: post.title, path },
      ],
      origin,
    ),
    faqPageJsonLd(post.faq),
  ].filter((item): item is JsonLdObject => item !== null)

  return { metadata, jsonLd }
}

// ---------------------------------------------------------------------------
// Kategoriya
// ---------------------------------------------------------------------------

export type CategorySeoInput = {
  slug: string
  name: string
  description: string | null
  metaTitle: string | null
  metaDescription: string | null
  noindex?: boolean
  updatedAt?: string | null
}

export function categorySeo(
  locale: Locale,
  category: CategorySeoInput,
  page: number,
  options: Options = {},
): PageSeo {
  const origin = options.origin ?? siteOrigin()
  const t = getSiteStrings(locale)
  const base = withoutBrand(category.metaTitle || category.name, locale)
  const path = categoryPath(locale, category.slug, page)
  const metadata = buildPageMetadata({
    locale,
    path,
    title: page > 1 ? `${base} (${t.page(page)})` : base,
    description: category.metaDescription || category.description,
    image: generatedOgImage(
      locale,
      { kind: 'category', slug: category.slug },
      category.name,
      versionToken(category.updatedAt),
      origin,
    ),
    noindex: category.noindex,
    feed: feedFor(locale, category.slug, category.name),
    origin,
    indexingAllowed: options.indexingAllowed,
  })
  const jsonLd = [
    breadcrumbJsonLd(
      [
        { name: t.home, path: homePath(locale) },
        { name: category.name, path: categoryPath(locale, category.slug) },
        ...(page > 1 ? [{ name: t.page(page), path }] : []),
      ],
      origin,
    ),
  ]
  return { metadata, jsonLd }
}

// ---------------------------------------------------------------------------
// Bosh sahifa
// ---------------------------------------------------------------------------

export type HomeSeoInput = {
  description?: string | null
  sameAs?: string[]
  defaultOgImage?: Media | null
  /** Sahifadagi eng so'nggi maqolalar (yangisi birinchi) → `ItemList` (OBLOG-68). */
  latest?: ItemListEntry[]
}

export function homeSeo(locale: Locale, input: HomeSeoInput = {}, options: Options = {}): PageSeo {
  const origin = options.origin ?? siteOrigin()
  const t = getSiteStrings(locale)
  const title = `${t.siteName} — ${t.tagline}`
  const description = input.description || t.tagline
  const image =
    mediaOgImage(input.defaultOgImage, origin) ??
    generatedOgImage(locale, { kind: 'site' }, title, undefined, origin)
  const metadata = buildPageMetadata({
    locale,
    path: homePath(locale),
    title,
    absoluteTitle: true,
    description,
    image,
    feed: feedFor(locale),
    origin,
    indexingAllowed: options.indexingAllowed,
  })
  const jsonLd = [
    organizationJsonLd(locale, { sameAs: input.sameAs, origin }),
    websiteJsonLd(locale, { description, origin }),
    itemListJsonLd(input.latest ?? [], { name: t.latestNews, origin }),
  ].filter((item): item is JsonLdObject => item !== null)
  return { metadata, jsonLd }
}

// ---------------------------------------------------------------------------
// Barcha yangiliklar arxivi (OBLOG-68): canonical — o'ziga (sahifalash bilan)
// ---------------------------------------------------------------------------

export function archiveSeo(
  locale: Locale,
  page: number,
  items: ItemListEntry[] = [],
  options: Options = {},
): PageSeo {
  const origin = options.origin ?? siteOrigin()
  const t = getSiteStrings(locale)
  const path = archivePath(locale, page)
  const metadata = buildPageMetadata({
    locale,
    path,
    title: page > 1 ? `${t.allNews} (${t.page(page)})` : t.allNews,
    description: t.archiveDescription,
    image: generatedOgImage(locale, { kind: 'site' }, t.allNews, undefined, origin),
    feed: feedFor(locale),
    origin,
    indexingAllowed: options.indexingAllowed,
  })
  const jsonLd = [
    breadcrumbJsonLd(
      [
        { name: t.home, path: homePath(locale) },
        { name: t.allNews, path: archivePath(locale) },
        ...(page > 1 ? [{ name: t.page(page), path }] : []),
      ],
      origin,
    ),
    itemListJsonLd(items, { name: t.allNews, origin }),
  ].filter((item): item is JsonLdObject => item !== null)
  return { metadata, jsonLd }
}

// ---------------------------------------------------------------------------
// Root layout (lotin / kirill): standart qiymatlar va preview'da `noindex`
// ---------------------------------------------------------------------------

/**
 * Root layout metadata'si: `metadataBase`, standart title/description, `og:locale`, va
 * indekslash yopiq muhitda (Vercel preview, `SEO_NOINDEX=1`) — `noindex, nofollow` barcha
 * sahifalarda (404 va hali metadata bermaydigan sahifalar ham).
 */
export function rootLayoutMetadata(locale: Locale, options: Options = {}): Metadata {
  const origin = options.origin ?? siteOrigin()
  const t = getSiteStrings(locale)
  const metadata: Metadata = {
    metadataBase: new URL(origin),
    title: `${t.siteName} — ${t.tagline}`,
    description: t.tagline,
    applicationName: BRAND_NAME[locale],
    // Brend belgisi (OBLOG-96): ICO — eski brauzerlar, SVG — zamonaviylari, iOS — apple-touch-icon.
    icons: {
      icon: [
        { url: BRAND_ICONS.ico, sizes: '32x32' },
        { url: BRAND_ICONS.svg, type: 'image/svg+xml' },
      ],
      apple: { url: BRAND_ICONS.apple, sizes: '180x180' },
    },
    // `app/manifest.ts` — fayl konvensiyasi ham shu havolani beradi; bu yerda aniq ko'rsatilgan.
    manifest: '/manifest.webmanifest',
    openGraph: { siteName: BRAND_NAME[locale], locale: OG_LOCALE, type: 'website' },
    twitter: { card: 'summary_large_image' },
  }
  const indexingAllowed = options.indexingAllowed ?? isIndexingAllowed()
  if (!indexingAllowed) metadata.robots = { index: false, follow: false }
  return metadata
}

// ---------------------------------------------------------------------------
// Teg (TZ §8.1: < 3 post — `noindex`)
// ---------------------------------------------------------------------------

export type TagSeoInput = CategorySeoInput

export function tagSeo(
  locale: Locale,
  tag: TagSeoInput,
  page: number,
  postCount: number,
  options: Options = {},
): PageSeo {
  const origin = options.origin ?? siteOrigin()
  const t = getSiteStrings(locale)
  const base = withoutBrand(tag.metaTitle || t.tagTitle(tag.name), locale)
  const path = tagPath(locale, tag.slug, page)
  const metadata = buildPageMetadata({
    locale,
    path,
    title: page > 1 ? `${base} (${t.page(page)})` : base,
    description: tag.metaDescription || tag.description || t.tagDescription(tag.name),
    image: generatedOgImage(locale, { kind: 'site' }, `#${tag.name}`, undefined, origin),
    noindex: Boolean(tag.noindex) || !isTagIndexable(postCount),
    origin,
    indexingAllowed: options.indexingAllowed,
  })
  const jsonLd = [
    breadcrumbJsonLd(
      [
        { name: t.home, path: homePath(locale) },
        { name: `#${tag.name}`, path: tagPath(locale, tag.slug) },
        ...(page > 1 ? [{ name: t.page(page), path }] : []),
      ],
      origin,
    ),
  ]
  return { metadata, jsonLd }
}

// ---------------------------------------------------------------------------
// Muallif (E-E-A-T, TZ §8.3): `Person` JSON-LD
// ---------------------------------------------------------------------------

export type AuthorSeoInput = {
  slug: string
  name: string
  position?: string | null
  bio?: string | null
  /** Avatar URL (nisbiy yoki to'liq). */
  image?: string | null
  sameAs?: string[]
}

export function authorSeo(
  locale: Locale,
  author: AuthorSeoInput,
  page: number,
  options: Options = {},
): PageSeo {
  const origin = options.origin ?? siteOrigin()
  const t = getSiteStrings(locale)
  const path = authorPath(locale, author.slug, page)
  const base = author.position ? `${author.name}, ${author.position}` : author.name
  const metadata = buildPageMetadata({
    locale,
    path,
    title: page > 1 ? `${base} (${t.page(page)})` : base,
    description: author.bio || t.authorDescription(author.name),
    image: generatedOgImage(locale, { kind: 'site' }, author.name, undefined, origin),
    origin,
    indexingAllowed: options.indexingAllowed,
  })
  const jsonLd = [
    personJsonLd(
      {
        name: author.name,
        path: authorPath(locale, author.slug),
        jobTitle: author.position ?? null,
        description: author.bio ?? null,
        image: author.image ?? null,
        sameAs: author.sameAs,
      },
      origin,
    ),
    breadcrumbJsonLd(
      [
        { name: t.home, path: homePath(locale) },
        { name: author.name, path: authorPath(locale, author.slug) },
        ...(page > 1 ? [{ name: t.page(page), path }] : []),
      ],
      origin,
    ),
  ]
  return { metadata, jsonLd }
}

// ---------------------------------------------------------------------------
// Statik sahifa (`pages`): meta (plugin-seo), FAQ bloklari → `FAQPage`
// ---------------------------------------------------------------------------

/** Sahifadagi barcha FAQ bloklari savollari. */
export function pageFaqItems(page: Pick<Page, 'layout'>): FaqItem[] {
  return (page.layout ?? []).flatMap((block) =>
    block.blockType === 'faq'
      ? (block.items ?? []).map((item) => ({ question: item.question, answer: item.answer }))
      : [],
  )
}

/** Sahifa matni (birinchi `content` bloki) — meta description zaxirasi. */
export function pageTextExcerpt(page: Pick<Page, 'layout'>): string | null {
  const block = (page.layout ?? []).find((item) => item.blockType === 'content')
  const text = block?.blockType === 'content' ? lexicalToPlainText(block.richText) : ''
  return text.trim() || null
}

export function staticPageSeo(locale: Locale, page: Page, options: Options = {}): PageSeo {
  const origin = options.origin ?? siteOrigin()
  const t = getSiteStrings(locale)
  const path = pagePath(locale, page.slug)
  const image =
    mediaOgImage(populated<Media>(page.meta?.image), origin) ??
    generatedOgImage(locale, { kind: 'site' }, page.title, undefined, origin)
  const metadata = buildPageMetadata({
    locale,
    path,
    title: page.meta?.title || page.title,
    // `meta.description` bo'lmasa — birinchi matn blokining boshi (`metaDescription` ~160 belgiga qisqartiradi).
    description: page.meta?.description || pageTextExcerpt(page),
    image,
    noindex: page.meta?.noindex,
    origin,
    indexingAllowed: options.indexingAllowed,
  })
  const jsonLd = [
    breadcrumbJsonLd(
      [
        { name: t.home, path: homePath(locale) },
        { name: page.title, path },
      ],
      origin,
    ),
    faqPageJsonLd(pageFaqItems(page)),
  ].filter((item): item is JsonLdObject => item !== null)
  return { metadata, jsonLd }
}

// ---------------------------------------------------------------------------
// Qidiruv (TZ §8.1, §8.3): har doim `noindex` (robots.txt'da ham yopiq)
// ---------------------------------------------------------------------------

export function searchMetadata(
  locale: Locale,
  query: string | null,
  options: Options = {},
): Metadata {
  const t = getSiteStrings(locale)
  return buildPageMetadata({
    locale,
    path: searchPath(locale),
    title: query ? t.searchResultsTitle(query) : t.searchTitle,
    description: t.searchPrompt,
    image: generatedOgImage(locale, { kind: 'site' }, t.searchTitle, undefined, options.origin),
    noindex: true,
    origin: options.origin,
    indexingAllowed: options.indexingAllowed,
  })
}
