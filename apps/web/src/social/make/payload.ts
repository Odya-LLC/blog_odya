/**
 * Make.com webhook JSON'i (OBLOG-91) — sof funksiyalar (DB/tarmoqsiz, unit testlar bilan).
 *
 * Bitta so'rov — bitta post, bitta yozuv (`script`). Make ssenariysi kerakli maydonlarni
 * oladi: Instagram — `instagram.imageUrl` + `instagram.caption`; Facebook Page —
 * `facebook.message` + `facebook.link`; Threads — `threads.text`; X — `x.text`; LinkedIn —
 * `linkedin.text` + `linkedin.link`. Sxema va misol — `docs/runbooks/social-autopost-options.md`.
 *
 * Cheklovlar:
 * - Instagram caption ≤ 2200 belgi, ≤ 30 heshteg (biz ≤ 15), havola bosilmaydi → "profildagi
 *   havola" chaqiruvi; rasm — ommaviy **JPEG**, nisbat 4:5 … 1.91:1 (`/og/{yozuv}/social/...`).
 * - Threads matni ≤ 500 belgi; X — 280 "og'irlikdagi" belgi, har URL = 23.
 */
import { createHash, createHmac } from 'node:crypto'

import type { Locale } from '@blog-odya/shared/locales'

import { toHashtag, truncateText } from '@/telegram/caption'
import { postPath } from '@/site/paths'

export const MAKE_PAYLOAD_VERSION = 1
export const INSTAGRAM_CAPTION_LIMIT = 2200
export const INSTAGRAM_MAX_HASHTAGS = 15
export const THREADS_TEXT_LIMIT = 500
export const X_TEXT_LIMIT = 280
/** X har qanday URL'ni 23 belgi deb hisoblaydi (t.co). */
export const X_URL_WEIGHT = 23
/** Caption'dagi lid: ko'pi bilan 3 gap va shuncha belgi. */
export const LEAD_MAX_SENTENCES = 3
export const LEAD_MAX_CHARS = 400

export type MakeEvent = 'post.published'
export type SocialImageVariant = 'square' | 'portrait' | 'landscape'
export type SocialNetwork = 'instagram' | 'facebook' | 'threads' | 'x' | 'linkedin'

/**
 * Ijtimoiy rasm shabloni versiyasi (OBLOG-94) — `?v=` kalitiga kiradi: dizayn o'zgarsa oshiring,
 * Instagram/Make va CDN yangi rasmni oladi. 3 — OBLOG-97: profil to'rining 3:4 xavfsiz zonasi.
 */
export const SOCIAL_TEMPLATE_VERSION = 3

export type SocialImageScheme = 'dark' | 'brand'

export interface SocialImageStyle {
  /** "Rasm ustida sarlavha" (standart — yoqiq). */
  overlay: boolean
  scheme: SocialImageScheme
}

export const DEFAULT_SOCIAL_IMAGE_STYLE: SocialImageStyle = { overlay: true, scheme: 'dark' }

/**
 * Rasm URL'ining `?v=` qiymati: qisqa sarlavha, muqova (id, yangilangan vaqti, focal point),
 * kategoriya, shablon sozlamalari va versiyasi xeshi (12 hex). Shulardan biri o'zgarsa — yangi
 * URL (CDN 24 soat keshlaydi, eski URL eski rasmni qaytarishi mumkin).
 */
export function socialImageVersion(
  imageKey: string,
  style: SocialImageStyle = DEFAULT_SOCIAL_IMAGE_STYLE,
): string {
  return createHash('sha1')
    .update(
      JSON.stringify([SOCIAL_TEMPLATE_VERSION, imageKey, style.overlay ? 1 : 0, style.scheme]),
    )
    .digest('hex')
    .slice(0, 12)
}

/** Rasm variantlari (JPEG): Instagram 1:1 va 4:5, boshqalar — 1.91:1. */
export const SOCIAL_IMAGE_SIZES: Record<SocialImageVariant, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1200, height: 630 },
}

const SCRIPT_SUFFIX: Record<Locale, 'latn' | 'cyrl'> = { 'uz-Latn': 'latn', 'uz-Cyrl': 'cyrl' }

/** Instagram/Facebook heshtegi: faqat lotin harf, raqam va `_` (o'zbek apostroflari olib tashlanadi). */
const LATIN_HASHTAG = /^#[A-Za-z0-9_]{2,40}$/

/**
 * Teg/kategoriya nomlari (lotin) → heshteglar: `Sun'iy intellekt` → `#SuniyIntellekt`,
 * `O‘yinlar` → `#Oyinlar`. Lotin bo'lmaganlari (kirill), juda qisqa/uzunlari tushiriladi,
 * takrorlar (katta-kichik harfsiz) olib tashlanadi. Brend heshtegi — oxirida, `count` ichida.
 */
export function socialHashtags(
  names: readonly (string | null | undefined)[],
  options: { count: number; brand?: string | null },
): string[] {
  const count = Math.max(0, Math.min(INSTAGRAM_MAX_HASHTAGS, Math.floor(options.count)))
  const brandRaw = options.brand?.trim().replace(/^#*/, '')
  const brand = brandRaw ? toHashtag(brandRaw) : null
  const validBrand = brand && LATIN_HASHTAG.test(brand) ? brand : null
  const limit = validBrand ? count - 1 : count
  const seen = new Set<string>(validBrand ? [validBrand.toLowerCase()] : [])
  const tags: string[] = []
  for (const name of names) {
    if (tags.length >= limit) break
    const tag = name ? toHashtag(name) : null
    if (!tag || !LATIN_HASHTAG.test(tag)) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  if (validBrand && count > 0) tags.push(validBrand)
  return tags
}

/** Matnni gaplarga bo'ladi (`.`, `!`, `?`, `…` dan keyin bo'shliq). */
function sentences(text: string): string[] {
  return (
    text
      .replace(/\s+/g, ' ')
      .trim()
      .match(/[^.!?…]+(?:[.!?…]+["»”’)]*|$)/g)
      ?.map((part) => part.trim())
      .filter(Boolean) ?? []
  )
}

/** Lid: 1–3 qisqa gap, `maxChars` dan oshmasin (birinchi gap uzun bo'lsa — qisqartiriladi). */
export function leadText(excerpt: string | null | undefined, maxChars = LEAD_MAX_CHARS): string {
  const parts = sentences(excerpt ?? '')
  if (parts.length === 0) return ''
  let lead = ''
  for (const part of parts.slice(0, LEAD_MAX_SENTENCES)) {
    const next = lead ? `${lead} ${part}` : part
    if (next.length > maxChars) break
    lead = next
  }
  return lead || truncateText(parts[0]!, maxChars)
}

/** Belgilar soni (Unicode code point — emoji bitta). */
export function charLength(text: string): number {
  return [...text].length
}

function joinBlocks(blocks: readonly (string | null | undefined)[]): string {
  return blocks
    .map((block) => block?.trim())
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Instagram caption: sarlavha (birinchi qator — "hook") → lid (1–3 gap) → chaqiruv
 * ("To'liq maqola — profildagi havolada.") → heshteglar. ≤ 2200 belgi: oshsa — avval lid,
 * keyin sarlavha qisqartiriladi; heshteglar ≤ 15.
 */
export function instagramCaption(input: {
  title: string
  lead?: string | null
  cta?: string | null
  hashtags?: readonly string[]
  limit?: number
}): string {
  const limit = input.limit ?? INSTAGRAM_CAPTION_LIMIT
  const hashtags = (input.hashtags ?? []).slice(0, INSTAGRAM_MAX_HASHTAGS).join(' ')
  const title = input.title.trim()
  const lead = input.lead?.trim() ?? ''
  const build = (t: string, l: string) => joinBlocks([t, l, input.cta, hashtags])
  const full = build(title, lead)
  if (charLength(full) <= limit) return full
  const withoutLead = build(title, '')
  const room = limit - charLength(withoutLead) - 2
  if (room >= 20 && lead) return build(title, truncateText(lead, room))
  if (charLength(withoutLead) <= limit) return withoutLead
  const titleRoom = limit - charLength(build('', '')) - 2
  return build(truncateText(title, Math.max(1, titleRoom)), '')
}

/** Threads: sarlavha + lid + havola, ≤ 500 belgi (oshsa lid, keyin sarlavha qisqaradi). */
export function threadsText(input: { title: string; lead?: string | null; url: string }): string {
  const build = (t: string, l: string) => joinBlocks([t, l, input.url])
  const full = build(input.title, input.lead ?? '')
  if (charLength(full) <= THREADS_TEXT_LIMIT) return full
  const base = build(input.title, '')
  const room = THREADS_TEXT_LIMIT - charLength(base) - 2
  if (room >= 20 && input.lead) return build(input.title, truncateText(input.lead, room))
  if (charLength(base) <= THREADS_TEXT_LIMIT) return base
  const titleRoom = THREADS_TEXT_LIMIT - charLength(input.url) - 2
  return build(truncateText(input.title, Math.max(1, titleRoom)), '')
}

/** X: sarlavha + havola, ≤ 280 (URL = 23). Kirill/lotin harflari og'irligi 1. */
export function xText(input: { title: string; url: string }): string {
  const room = X_TEXT_LIMIT - X_URL_WEIGHT - 2
  return `${truncateText(input.title, room)}\n\n${input.url}`
}

/** Facebook / LinkedIn matni: sarlavha + lid + heshteglar (havola — alohida `link` maydoni). */
export function longText(input: {
  title: string
  lead?: string | null
  hashtags?: readonly string[]
}): string {
  return joinBlocks([input.title, input.lead, (input.hashtags ?? []).join(' ')])
}

/**
 * Tarmoq uchun maqola havolasi (UTM bilan): `utm_source={tarmoq}&utm_medium=social&
 * utm_campaign=latn|cyrl`. Kirill — `/kr/...`.
 */
export function socialPostUrl(options: {
  origin: string
  locale: Locale
  categorySlug: string
  slug: string
  source?: SocialNetwork
}): string {
  const url = new URL(
    postPath(options.locale, options.categorySlug, options.slug),
    `${options.origin.replace(/\/+$/, '')}/`,
  )
  if (options.source) {
    url.searchParams.set('utm_source', options.source)
    url.searchParams.set('utm_medium', 'social')
    url.searchParams.set('utm_campaign', SCRIPT_SUFFIX[options.locale])
  }
  return url.toString()
}

/**
 * JPEG variant URL'i: `/og/{latn|cyrl}/social/{id}/{variant}.jpg?v=…` (`/og/**` — `robots.txt`
 * da ochiq, Meta crawler'i oladi; `/api/**` yopiq).
 */
export function socialImageUrl(options: {
  origin: string
  postId: number | string
  variant: SocialImageVariant
  locale: Locale
  version?: string | null
}): string {
  const url = new URL(
    `/og/${SCRIPT_SUFFIX[options.locale]}/social/${options.postId}/${options.variant}.jpg`,
    `${options.origin.replace(/\/+$/, '')}/`,
  )
  if (options.version) url.searchParams.set('v', options.version)
  return url.toString()
}

/** `square.jpg` → `square`; noto'g'ri nom — `null`. */
export function parseSocialImageFile(file: string): SocialImageVariant | null {
  const match = /^(square|portrait|landscape)\.jpe?g$/.exec(file)
  return match ? (match[1] as SocialImageVariant) : null
}

/** `X-Odya-Signature` qiymati: `sha256=` + HMAC-SHA256(tana, sir) hex. */
export function signMakeBody(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`
}

export interface MakePostInput {
  id: number
  slug: string
  title: string
  excerpt?: string | null
  publishedAt?: string | null
  updatedAt?: string | null
  isBreaking?: boolean | null
  category: { slug: string; name: string }
  /** Teglar — shu yozuvdagi nomlar bilan. */
  tags: { slug: string; name: string }[]
  /** Heshteg uchun lotin nomlar (teglar, keyin kategoriya). */
  hashtagNames: string[]
  coverAlt?: string | null
  hasCover: boolean
  /** Rasm ustidagi qisqa sarlavha (OBLOG-94, `resolveSocialTitle`). */
  socialTitle?: string | null
  /** Rasm mazmuni kaliti (`socialImageVersion` uchun); bo'lmasa — `updatedAt`. */
  imageKey?: string | null
}

export interface MakePayloadOptions {
  event: MakeEvent
  deliveryId: string
  sentAt: string
  test: boolean
  locale: Locale
  origin: string
  hashtagsCount: number
  brandHashtag?: string | null
  instagramCta?: string | null
  instagramImage: Extract<SocialImageVariant, 'square' | 'portrait'>
  /** Rasm shabloni sozlamalari (`?v=` ga kiradi). */
  imageStyle?: SocialImageStyle
}

export interface MakePayload {
  version: number
  event: MakeEvent
  test: boolean
  deliveryId: string
  sentAt: string
  script: Locale
  post: {
    id: number
    slug: string
    title: string
    /** Rasm ustidagi qisqa sarlavha (OBLOG-94). */
    socialTitle: string
    excerpt: string
    lead: string
    url: string
    urls: Record<Locale, string>
    publishedAt: string | null
    updatedAt: string | null
    isBreaking: boolean
    category: { slug: string; name: string }
    tags: { slug: string; name: string }[]
  }
  hashtags: string[]
  images: {
    square: string
    portrait: string
    landscape: string
    alt: string
    /** `false` — muqova yo'q, rasm avtomatik brend kartochkasi. */
    fromCover: boolean
    width: Record<SocialImageVariant, number>
    height: Record<SocialImageVariant, number>
  }
  instagram: { caption: string; imageUrl: string; altText: string }
  facebook: { message: string; link: string; imageUrl: string }
  threads: { text: string; link: string; imageUrl: string }
  x: { text: string }
  linkedin: { text: string; link: string; imageUrl: string }
}

/** Make webhook'iga yuboriladigan JSON. */
export function buildMakePayload(post: MakePostInput, options: MakePayloadOptions): MakePayload {
  const { locale, origin } = options
  const urlFor = (source?: SocialNetwork, target: Locale = locale) =>
    socialPostUrl({
      origin,
      locale: target,
      categorySlug: post.category.slug,
      slug: post.slug,
      source,
    })
  const version = post.imageKey
    ? socialImageVersion(post.imageKey, options.imageStyle)
    : post.updatedAt
      ? String(Math.floor(Date.parse(post.updatedAt) / 1000))
      : null
  const image = (variant: SocialImageVariant) =>
    socialImageUrl({ origin, postId: post.id, variant, locale, version })
  const images = {
    square: image('square'),
    portrait: image('portrait'),
    landscape: image('landscape'),
  }
  const title = post.title.trim()
  const excerpt = (post.excerpt ?? '').trim()
  const lead = leadText(excerpt)
  const hashtags = socialHashtags(post.hashtagNames, {
    count: options.hashtagsCount,
    brand: options.brandHashtag,
  })
  const alt = post.coverAlt?.trim() || title
  const igImage = images[options.instagramImage]

  return {
    version: MAKE_PAYLOAD_VERSION,
    event: options.event,
    test: options.test,
    deliveryId: options.deliveryId,
    sentAt: options.sentAt,
    script: locale,
    post: {
      id: post.id,
      slug: post.slug,
      title,
      socialTitle: post.socialTitle?.trim() || title,
      excerpt,
      lead,
      url: urlFor(),
      urls: { 'uz-Latn': urlFor(undefined, 'uz-Latn'), 'uz-Cyrl': urlFor(undefined, 'uz-Cyrl') },
      publishedAt: post.publishedAt ?? null,
      updatedAt: post.updatedAt ?? null,
      isBreaking: Boolean(post.isBreaking),
      category: post.category,
      tags: post.tags,
    },
    hashtags,
    images: {
      ...images,
      alt,
      fromCover: post.hasCover,
      width: {
        square: SOCIAL_IMAGE_SIZES.square.width,
        portrait: SOCIAL_IMAGE_SIZES.portrait.width,
        landscape: SOCIAL_IMAGE_SIZES.landscape.width,
      },
      height: {
        square: SOCIAL_IMAGE_SIZES.square.height,
        portrait: SOCIAL_IMAGE_SIZES.portrait.height,
        landscape: SOCIAL_IMAGE_SIZES.landscape.height,
      },
    },
    instagram: {
      caption: instagramCaption({ title, lead, cta: options.instagramCta, hashtags }),
      imageUrl: igImage,
      altText: truncateText(alt, 1000),
    },
    facebook: {
      message: longText({ title, lead, hashtags }),
      link: urlFor('facebook'),
      imageUrl: images.landscape,
    },
    threads: {
      text: threadsText({ title, lead, url: urlFor('threads') }),
      link: urlFor('threads'),
      imageUrl: images.square,
    },
    x: { text: xText({ title, url: urlFor('x') }) },
    linkedin: {
      text: longText({ title, lead, hashtags: hashtags.slice(0, 5) }),
      link: urlFor('linkedin'),
      imageUrl: images.landscape,
    },
  }
}
