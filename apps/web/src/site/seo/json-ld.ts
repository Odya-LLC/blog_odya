/**
 * JSON-LD (schema.org) quruvchilari (TZ §8.2): `NewsArticle` (`inLanguage`, `isBasedOn`),
 * `BreadcrumbList`, `Organization` + `WebSite` (`SearchAction`), `Person`, `FAQPage`.
 *
 * Google Search talablari (developers.google.com/search/docs/appearance/structured-data):
 * Article — `headline`, `image` (to'liq URL), `datePublished`/`dateModified` (ISO 8601, vaqt
 * mintaqasi bilan), `author` (`name` + `url`), `publisher`; Breadcrumb — ≥ 2 element, `position`
 * 1 dan; FAQ — `Question.name` + `acceptedAnswer.text`. Unit testlar shu talablarni tekshiradi.
 *
 * Yon ta'sirsiz modul — Payload'ga bog'liq emas.
 */
import type { Locale } from '@blog-odya/shared'

import { homePath } from '../paths'
import { absoluteUrl, BRAND_NAME, ORGANIZATION, siteOrigin } from './config'

export type JsonLdObject = { '@context'?: string; '@type': string | string[] } & Record<
  string,
  unknown
>

const CONTEXT = 'https://schema.org'

const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

/** `<script type="application/ld+json">` ichiga xavfsiz: `<`, `>`, `&`, U+2028/2029 qochiriladi. */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replaceAll(LINE_SEPARATOR, '\\u2028')
    .replaceAll(PARAGRAPH_SEPARATOR, '\\u2029')
}

export function organizationId(origin: string = siteOrigin()): string {
  return `${origin}/#organization`
}

export function websiteId(locale: Locale, origin: string = siteOrigin()): string {
  return `${absoluteUrl(homePath(locale), origin)}#website`
}

function otherLocale(locale: Locale): Locale {
  return locale === 'uz-Latn' ? 'uz-Cyrl' : 'uz-Latn'
}

function logoObject(origin: string) {
  return {
    '@type': 'ImageObject',
    url: absoluteUrl(ORGANIZATION.logoPath, origin),
    width: ORGANIZATION.logoSize,
    height: ORGANIZATION.logoSize,
  }
}

/** Nashriyot: Odya LLC (`NewsMediaOrganization` — `Organization` ning kichik turi). */
export function organizationJsonLd(
  locale: Locale,
  options: { sameAs?: string[]; origin?: string } = {},
): JsonLdObject {
  const origin = options.origin ?? siteOrigin()
  const sameAs = (options.sameAs ?? []).filter((url) => /^https?:\/\//i.test(url))
  return {
    '@context': CONTEXT,
    '@type': 'NewsMediaOrganization',
    '@id': organizationId(origin),
    name: BRAND_NAME[locale],
    alternateName: BRAND_NAME[otherLocale(locale)],
    legalName: ORGANIZATION.legalName,
    url: absoluteUrl(homePath(locale), origin),
    logo: logoObject(origin),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  }
}

/** Qidiruv sahifasi (M1-07): `/search?q=` / `/kr/search?q=`. */
export function searchUrlTemplate(locale: Locale, origin: string = siteOrigin()): string {
  const path = locale === 'uz-Cyrl' ? '/kr/search' : '/search'
  return `${absoluteUrl(path, origin)}?q={search_term_string}`
}

/** `WebSite` + `SearchAction` (sitelinks qidiruv maydoni). */
export function websiteJsonLd(
  locale: Locale,
  options: { description?: string | null; origin?: string } = {},
): JsonLdObject {
  const origin = options.origin ?? siteOrigin()
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': websiteId(locale, origin),
    url: absoluteUrl(homePath(locale), origin),
    name: BRAND_NAME[locale],
    alternateName: BRAND_NAME[otherLocale(locale)],
    ...(options.description ? { description: options.description } : {}),
    inLanguage: locale,
    publisher: { '@id': organizationId(origin) },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: searchUrlTemplate(locale, origin) },
      'query-input': 'required name=search_term_string',
    },
  }
}

export type BreadcrumbItem = { name: string; path: string }

/** `BreadcrumbList`: bosh sahifa → … → joriy sahifa (`position` 1 dan). */
export function breadcrumbJsonLd(
  items: BreadcrumbItem[],
  origin: string = siteOrigin(),
): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path, origin),
    })),
  }
}

export type PersonInput = {
  name: string
  /** Muallif sahifasi yo'li (`/author/{slug}`, `/kr/author/{slug}`). */
  path?: string | null
  jobTitle?: string | null
  description?: string | null
  image?: string | null
  sameAs?: string[]
}

function personObject(person: PersonInput, origin: string) {
  const url = person.path ? absoluteUrl(person.path, origin) : undefined
  const sameAs = (person.sameAs ?? []).filter((link) => /^https?:\/\//i.test(link))
  return {
    '@type': 'Person',
    ...(url ? { '@id': `${url}#person`, url } : {}),
    name: person.name,
    ...(person.jobTitle ? { jobTitle: person.jobTitle } : {}),
    ...(person.description ? { description: person.description } : {}),
    ...(person.image ? { image: absoluteUrl(person.image, origin) } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  }
}

/** `Person` — muallif sahifasi (M1-07) uchun alohida JSON-LD. */
export function personJsonLd(person: PersonInput, origin: string = siteOrigin()): JsonLdObject {
  return {
    '@context': CONTEXT,
    ...personObject(person, origin),
    worksFor: { '@id': organizationId(origin) },
  }
}

export type FaqItem = { question: string; answer: string }

/** `FAQPage` — post `faq` maydoni yoki sahifa FAQ bloki; bo'sh bo'lsa `null`. */
export function faqPageJsonLd(items: FaqItem[] | null | undefined): JsonLdObject | null {
  const valid = (items ?? []).filter((item) => item.question?.trim() && item.answer?.trim())
  if (valid.length === 0) return null
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: valid.map((item) => ({
      '@type': 'Question',
      name: item.question.trim(),
      acceptedAnswer: { '@type': 'Answer', text: item.answer.trim() },
    })),
  }
}

export type NewsArticleInput = {
  locale: Locale
  /** Maqolaning joriy yozuvdagi yo'li. */
  path: string
  headline: string
  description?: string | null
  /** To'liq URL'lar (muqova variantlari yoki generatsiya qilingan OG). */
  images: string[]
  datePublished: string
  dateModified?: string | null
  authors: PersonInput[]
  section?: string | null
  keywords?: string[]
  /** Manba URL'lari (TZ §2.3 atributsiya) → `isBasedOn`. */
  sources?: string[]
  origin?: string
}

/** ISO 8601, vaqt mintaqasi bilan (Payload sanalari UTC `…Z`). */
function isoDate(value: string): string {
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : value
}

/** Google tavsiyasi: `headline` ≤ 110 belgi. */
export const HEADLINE_MAX = 110

function clampHeadline(headline: string): string {
  const chars = [...headline.trim()]
  return chars.length <= HEADLINE_MAX
    ? chars.join('')
    : `${chars.slice(0, HEADLINE_MAX - 1).join('')}…`
}

/** `NewsArticle` (TZ §8.2). Muallif bo'lmasa — tahririyat (Organization). */
export function newsArticleJsonLd(input: NewsArticleInput): JsonLdObject {
  const origin = input.origin ?? siteOrigin()
  const url = absoluteUrl(input.path, origin)
  const publisher = {
    '@type': 'NewsMediaOrganization',
    '@id': organizationId(origin),
    name: BRAND_NAME[input.locale],
    logo: logoObject(origin),
  }
  const authors =
    input.authors.length > 0
      ? input.authors.map((author) => personObject(author, origin))
      : [{ '@type': 'NewsMediaOrganization', name: BRAND_NAME[input.locale], url: `${origin}/` }]
  const sources = [...new Set((input.sources ?? []).filter((src) => /^https?:\/\//i.test(src)))]
  const keywords = (input.keywords ?? []).filter(Boolean)
  return {
    '@context': CONTEXT,
    '@type': 'NewsArticle',
    '@id': `${url}#article`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    headline: clampHeadline(input.headline),
    ...(input.description ? { description: input.description } : {}),
    image: [...new Set(input.images)],
    datePublished: isoDate(input.datePublished),
    dateModified: isoDate(input.dateModified || input.datePublished),
    author: authors,
    publisher,
    inLanguage: input.locale,
    ...(input.section ? { articleSection: input.section } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
    ...(sources.length === 1 ? { isBasedOn: sources[0] } : {}),
    ...(sources.length > 1 ? { isBasedOn: sources } : {}),
    isAccessibleForFree: true,
    isPartOf: { '@id': websiteId(input.locale, origin) },
  }
}
