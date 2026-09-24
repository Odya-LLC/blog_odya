/**
 * Sahifa metadata'si (TZ §8.2): `<title>`, description, canonical (o'ziga), hreflang
 * (`uz-Latn`, `uz-Cyrl`, `x-default` → lotin), OpenGraph (`og:locale=uz_UZ`, `article:*`),
 * Twitter Card (`summary_large_image`), `robots` (noindex: sahifa/teg qoidasi yoki preview).
 *
 * Yon ta'sirsiz — unit testlanadi (hreflang juftliklari o'zaro to'g'riligi va h.k.).
 */
import { LOCALES, type Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'

import type { Media } from '@/payload-types'

import { alternatePaths } from '../paths'
import {
  absoluteUrl,
  BRAND_NAME,
  isIndexingAllowed,
  LOCALE_SCRIPT,
  OG_LOCALE,
  siteOrigin,
  TAG_INDEX_MIN_POSTS,
  TITLE_SEPARATOR,
} from './config'

/** hreflang kodlari: ikkala yozuv + `x-default` (→ lotin). */
export type HreflangCode = Locale | 'x-default'

export type HreflangMap = Record<HreflangCode, string>

/**
 * Sahifaning barcha yozuvdagi to'liq URL'lari. `pathname` — istalgan yozuvdagi yo'l
 * (`/kibersport/x` yoki `/kr/kibersport/x` — natija bir xil).
 */
export function hreflangUrls(pathname: string, origin: string = siteOrigin()): HreflangMap {
  const paths = alternatePaths(pathname)
  const map = Object.fromEntries(
    LOCALES.map((locale) => [locale, absoluteUrl(paths[locale], origin)]),
  ) as Record<Locale, string>
  return { ...map, 'x-default': map['uz-Latn'] }
}

/** Canonical (joriy yozuvning o'zi) + hreflang alternates (Next.js `alternates`). */
export function localeAlternates(
  locale: Locale,
  pathname: string,
  origin: string = siteOrigin(),
): { canonical: string; languages: HreflangMap } {
  const languages = hreflangUrls(pathname, origin)
  return { canonical: languages[locale], languages }
}

const BRAND_SUFFIXES = Object.values(BRAND_NAME).flatMap((brand) => [
  `${TITLE_SEPARATOR}${brand}`,
  ` | ${brand}`,
  ` - ${brand}`,
])

/**
 * `{seoTitle} — Blog Odya` (kirillda `— Блог Одя`). `meta.title` plugin-seo'da brend bilan
 * generatsiya qilinadi, kirill esa (transliteratsiya bo'lmaguncha) lotin fallback'ini oladi —
 * shuning uchun mavjud brend qo'shimchasi olib tashlanib, joriy yozuvdagisi qo'yiladi.
 */
export function withBrand(title: string | null | undefined, locale: Locale): string {
  let base = (title ?? '').trim()
  for (;;) {
    const suffix = BRAND_SUFFIXES.find((candidate) => base.endsWith(candidate))
    if (!suffix) break
    base = base.slice(0, -suffix.length).trim()
  }
  if (!base || Object.values(BRAND_NAME).includes(base)) return BRAND_NAME[locale]
  return `${base}${TITLE_SEPARATOR}${BRAND_NAME[locale]}`
}

/** Sarlavhadan brend qo'shimchasini olib tashlaydi (OG/Twitter `title` uchun). */
export function withoutBrand(title: string | null | undefined, locale: Locale): string {
  const full = withBrand(title, locale)
  const suffix = `${TITLE_SEPARATOR}${BRAND_NAME[locale]}`
  return full.endsWith(suffix) ? full.slice(0, -suffix.length) : full
}

/** Meta description: bo'shliqlar siqiladi, ~160 belgidan uzun bo'lsa so'z chegarasida qisqartiriladi. */
export function metaDescription(text: string | null | undefined, max = 160): string | undefined {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return undefined
  if ([...clean].length <= max) return clean
  const cut = [...clean].slice(0, max - 1).join('')
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:—-]+$/, '')}…`
}

export type SeoImage = { url: string; width: number; height: number; alt?: string; type?: string }

/**
 * `media` hujjatidan OG rasm: `og` varianti (1200×630, kesilgan), bo'lmasa asl fayl.
 * Nisbiy URL (`/api/media/file/…`) sayt manzili bilan to'liq URL'ga aylantiriladi.
 */
export function mediaOgImage(
  media: Pick<Media, 'url' | 'width' | 'height' | 'alt' | 'mimeType' | 'sizes'> | null | undefined,
  origin: string = siteOrigin(),
): SeoImage | null {
  if (!media) return null
  const og = media.sizes?.og
  if (og?.url && og.width && og.height) {
    return {
      url: absoluteUrl(og.url, origin),
      width: og.width,
      height: og.height,
      alt: media.alt ?? undefined,
      type: og.mimeType ?? undefined,
    }
  }
  if (!media.url || !media.width || !media.height) return null
  return {
    url: absoluteUrl(media.url, origin),
    width: media.width,
    height: media.height,
    alt: media.alt ?? undefined,
    type: media.mimeType ?? undefined,
  }
}

/** Qisqa, barqaror kesh-buzar: `updatedAt` → base36 (OG rasm URL'i o'zgarsa ijtimoiy tarmoqlar qayta oladi). */
export function versionToken(value: string | null | undefined): string | undefined {
  const time = value ? Date.parse(value) : NaN
  return Number.isFinite(time) ? Math.floor(time / 1000).toString(36) : undefined
}

export type GeneratedOgTarget =
  { kind: 'site' } | { kind: 'post'; slug: string } | { kind: 'category'; slug: string }

/** `next/og` bilan chiziladigan OG rasm yo'li (`app/(seo)/og/…`), 1200×630 PNG. */
export function generatedOgPath(
  locale: Locale,
  target: GeneratedOgTarget,
  version?: string,
): string {
  const script = LOCALE_SCRIPT[locale]
  const base =
    target.kind === 'site' ? `/og/${script}` : `/og/${script}/${target.kind}/${target.slug}`
  return version ? `${base}?v=${version}` : base
}

export function generatedOgImage(
  locale: Locale,
  target: GeneratedOgTarget,
  alt: string,
  version?: string,
  origin: string = siteOrigin(),
): SeoImage {
  return {
    url: absoluteUrl(generatedOgPath(locale, target, version), origin),
    width: 1200,
    height: 630,
    alt,
    type: 'image/png',
  }
}

export type NoindexReason = boolean | null | undefined

/** Robots meta: sahifa `noindex` bo'lsa yoki muhit indekslashga yopiq bo'lsa (preview). */
export function robotsMeta(
  noindex: NoindexReason,
  indexingAllowed: boolean = isIndexingAllowed(),
): Metadata['robots'] {
  if (!indexingAllowed) return { index: false, follow: false }
  if (noindex) return { index: false, follow: true }
  return undefined
}

/** Teg sahifasi: < 3 post — `noindex` (TZ §8.1). M1-07 teg sahifasi shu funksiyani ishlatadi. */
export function isTagIndexable(postCount: number): boolean {
  return postCount >= TAG_INDEX_MIN_POSTS
}

/** Teg sahifasi robots meta'si (post soni + `meta.noindex` + muhit). */
export function tagRobots(
  postCount: number,
  metaNoindex?: boolean | null,
  indexingAllowed: boolean = isIndexingAllowed(),
): Metadata['robots'] {
  return robotsMeta(Boolean(metaNoindex) || !isTagIndexable(postCount), indexingAllowed)
}

export type PageSeoInput = {
  locale: Locale
  /** Joriy sahifa yo'li (joriy yozuv prefiksi bilan yoki prefiksiz — farqi yo'q). */
  path: string
  /** SEO sarlavha (brendsiz yoki brend bilan — `withBrand` normallashtiradi). */
  title: string
  /** `title` ni o'zgarishsiz ishlatish (masalan, bosh sahifa: `Blog Odya — shior`). */
  absoluteTitle?: boolean
  description?: string | null
  image?: SeoImage | null
  type?: 'website' | 'article'
  noindex?: boolean | null
  article?: {
    publishedTime?: string | null
    modifiedTime?: string | null
    section?: string | null
    tags?: string[]
    /** Muallif sahifalari (to'liq URL). */
    authors?: string[]
  }
  /** RSS lentasi: `<link rel="alternate" type="application/rss+xml">`. */
  feed?: { path: string; title: string }
  origin?: string
  indexingAllowed?: boolean
}

/** Barcha ommaviy sahifalar uchun yagona metadata quruvchi. */
export function buildPageMetadata(input: PageSeoInput): Metadata {
  const origin = input.origin ?? siteOrigin()
  const { locale } = input
  const alternates = localeAlternates(locale, input.path, origin)
  const fullTitle = input.absoluteTitle ? input.title : withBrand(input.title, locale)
  const shortTitle = input.absoluteTitle ? input.title : withoutBrand(input.title, locale)
  const description = metaDescription(input.description)
  const images = input.image ? [input.image] : undefined
  const type = input.type ?? 'website'

  const openGraph: NonNullable<Metadata['openGraph']> =
    type === 'article'
      ? {
          type: 'article',
          publishedTime: input.article?.publishedTime ?? undefined,
          modifiedTime: input.article?.modifiedTime ?? undefined,
          section: input.article?.section ?? undefined,
          tags: input.article?.tags?.length ? input.article.tags : undefined,
          authors: input.article?.authors?.length ? input.article.authors : undefined,
          url: alternates.canonical,
          siteName: BRAND_NAME[locale],
          locale: OG_LOCALE,
          title: shortTitle,
          description,
          images,
        }
      : {
          type: 'website',
          url: alternates.canonical,
          siteName: BRAND_NAME[locale],
          locale: OG_LOCALE,
          title: shortTitle,
          description,
          images,
        }

  const metadata: Metadata = {
    title: { absolute: fullTitle },
    description,
    alternates: {
      canonical: alternates.canonical,
      languages: alternates.languages,
      ...(input.feed
        ? {
            types: {
              'application/rss+xml': [
                { url: absoluteUrl(input.feed.path, origin), title: input.feed.title },
              ],
            },
          }
        : {}),
    },
    openGraph,
    twitter: {
      card: 'summary_large_image',
      title: shortTitle,
      description,
      images: input.image ? [{ url: input.image.url, alt: input.image.alt }] : undefined,
    },
  }
  const robots = robotsMeta(input.noindex, input.indexingAllowed)
  if (robots) metadata.robots = robots
  return metadata
}
