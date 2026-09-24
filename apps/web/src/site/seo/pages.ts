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

import { getSiteStrings } from '@/i18n/site'
import { lexicalToPlainText } from '@/lib/lexical'
import type { Author, Category, Media, Page, Post, Tag } from '@/payload-types'

import { populated, postDate, toSourceRefs } from '../mappers'
import {
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
  BRAND_NAME,
  isIndexingAllowed,
  OG_LOCALE,
  ORGANIZATION,
  siteOrigin,
} from './config'
import {
  breadcrumbJsonLd,
  type FaqItem,
  faqPageJsonLd,
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

export type ArticleSeoInput = { post: Post; category: Category }

function authorPersons(post: Post, locale: Locale, origin: string): PersonInput[] {
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

/** Maqola rasmlari: `meta.image` → muqova → avtomatik OG (`next/og`). */
export function articleImages(
  locale: Locale,
  post: Post,
  origin: string = siteOrigin(),
): { og: SeoImage; jsonLd: string[] } {
  const title = post.title
  const metaImage = mediaOgImage(populated<Media>(post.meta?.image), origin)
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
        ...(cover.url ? [absoluteUrl(cover.url, origin)] : []),
        ...(coverOg ? [coverOg.url] : []),
        ...(metaImage ? [metaImage.url] : []),
      ]
    : [og.url]
  return { og: { ...og, alt: og.alt || title }, jsonLd: [...new Set(jsonLd)] }
}

export function articleSeo(
  locale: Locale,
  { post, category }: ArticleSeoInput,
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
  ]
  return { metadata, jsonLd }
}

// ---------------------------------------------------------------------------
// Teg (M1-07): < 3 post yoki `meta.noindex` — `noindex` (TZ §8.1)
// ---------------------------------------------------------------------------

export type TagSeoInput = {
  slug: string
  name: string
  description: string | null
  metaTitle: string | null
  metaDescription: string | null
  noindex?: boolean
  /** Tegdagi chop etilgan postlar soni. */
  postCount: number
}

export function tagSeo(
  locale: Locale,
  tag: TagSeoInput,
  page: number,
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
    image: generatedOgImage(locale, { kind: 'site' }, tag.name, undefined, origin),
    noindex: Boolean(tag.noindex) || !isTagIndexable(tag.postCount),
    origin,
    indexingAllowed: options.indexingAllowed,
  })
  const jsonLd = [
    breadcrumbJsonLd(
      [
        { name: t.home, path: homePath(locale) },
        { name: tag.name, path: tagPath(locale, tag.slug) },
        ...(page > 1 ? [{ name: t.page(page), path }] : []),
      ],
      origin,
    ),
  ]
  return { metadata, jsonLd }
}

// ---------------------------------------------------------------------------
// Muallif (M1-07): `Person` JSON-LD (E-E-A-T, TZ §8.3)
// ---------------------------------------------------------------------------

export type AuthorSeoInput = {
  slug: string
  name: string
  position: string | null
  bio: string | null
  avatarUrl: string | null
  socials: Array<{ url: string }>
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
  const profilePath = authorPath(locale, author.slug)
  const metadata = buildPageMetadata({
    locale,
    path,
    title: page > 1 ? `${author.name} (${t.page(page)})` : author.name,
    description: author.bio || t.authorDescription(author.name),
    image: generatedOgImage(locale, { kind: 'site' }, author.name, undefined, origin),
    origin,
    indexingAllowed: options.indexingAllowed,
  })
  const jsonLd = [
    personJsonLd(
      {
        name: author.name,
        path: profilePath,
        jobTitle: author.position,
        description: author.bio,
        image: author.avatarUrl ? absoluteUrl(author.avatarUrl, origin) : null,
        sameAs: author.socials.map((social) => social.url),
      },
      origin,
    ),
    breadcrumbJsonLd(
      [
        { name: t.home, path: homePath(locale) },
        { name: author.name, path: profilePath },
        ...(page > 1 ? [{ name: t.page(page), path }] : []),
      ],
      origin,
    ),
  ]
  return { metadata, jsonLd }
}

// ---------------------------------------------------------------------------
// Statik sahifa (M1-07): `meta.*` (plugin-seo), FAQ bloklari → `FAQPage`
// ---------------------------------------------------------------------------

/** Sahifa FAQ bloklaridagi savol-javoblar (JSON-LD `FAQPage`). */
export function pageFaqItems(page: Pick<Page, 'layout'>): FaqItem[] {
  return (page.layout ?? []).flatMap((block) =>
    block.blockType === 'faq'
      ? (block.items ?? []).map((item) => ({ question: item.question, answer: item.answer }))
      : [],
  )
}

/** Meta description bo'lmasa — birinchi matn blokidan. */
export function pagePlainText(page: Pick<Page, 'layout'>): string {
  const block = (page.layout ?? []).find((item) => item.blockType === 'content')
  return block?.blockType === 'content' ? lexicalToPlainText(block.richText) : ''
}

export function staticPageSeo(
  locale: Locale,
  page: Pick<Page, 'slug' | 'title' | 'layout' | 'meta' | 'updatedAt'>,
  options: Options = {},
): PageSeo {
  const origin = options.origin ?? siteOrigin()
  const t = getSiteStrings(locale)
  const path = pagePath(locale, page.slug)
  const metadata = buildPageMetadata({
    locale,
    path,
    title: page.meta?.title || page.title,
    description: page.meta?.description || pagePlainText(page) || null,
    image:
      mediaOgImage(populated<Media>(page.meta?.image), origin) ??
      generatedOgImage(locale, { kind: 'site' }, page.title, undefined, origin),
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
// Qidiruv (M1-07): har doim `noindex` (TZ §8.1), canonical — so'rovsiz `/search`
// ---------------------------------------------------------------------------

export function searchMetadata(locale: Locale, query: string, options: Options = {}): Metadata {
  const t = getSiteStrings(locale)
  const origin = options.origin ?? siteOrigin()
  return buildPageMetadata({
    locale,
    path: searchPath(locale),
    title: query ? t.searchResultsFor(query) : t.searchTitle,
    description: t.searchPrompt,
    image: generatedOgImage(locale, { kind: 'site' }, t.searchTitle, undefined, origin),
    noindex: true,
    origin,
    indexingAllowed: options.indexingAllowed,
  })
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
    // Brend belgisi (`public/brand`): `<link rel="icon">` bo'lmasa brauzer `/favicon.ico` so'rab
    // 404 oladi (konsol xatosi — Lighthouse Best Practices, M1-07).
    icons: {
      icon: [{ url: ORGANIZATION.logoPath, type: 'image/png', sizes: '512x512' }],
      apple: [{ url: ORGANIZATION.logoPath, sizes: '512x512' }],
    },
    openGraph: { siteName: BRAND_NAME[locale], locale: OG_LOCALE, type: 'website' },
    twitter: { card: 'summary_large_image' },
  }
  const indexingAllowed = options.indexingAllowed ?? isIndexingAllowed()
  if (!indexingAllowed) metadata.robots = { index: false, follow: false }
  return metadata
}
