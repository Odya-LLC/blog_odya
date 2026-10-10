/**
 * Instagram story + dayjest karuseli (OBLOG-118) — sof funksiyalar (DB/tarmoqsiz, unit testlar bilan):
 * dayjest caption'i, Make JSON'i (`type: "digest"`), muqova slaydi URL'i (imzo bilan) va kunlik
 * limit qoidasi.
 *
 * Karusel: 1-slayd — muqova ("Kun yangiliklari · 10-oktabr" + 5 ta sarlavha, `/og/latn/digest/
 * cover.jpg`), keyin ko'pi bilan 9 ta post slaydi (har postning 4:5 ijtimoiy rasmi) — jami ≤ 10
 * (Instagram karusel chegarasi). Caption ≤ 2200 belgi, ≤ 30 heshteg (bizda ≤ 15).
 */
import { createHmac } from 'node:crypto'

import type { Locale } from '@blog-odya/shared/locales'

import { DIGEST_TITLE_LEVELS, digestItemTitle } from '@/telegram/digestCaption'

import {
  charLength,
  INSTAGRAM_CAPTION_LIMIT,
  MAKE_PAYLOAD_VERSION,
  SOCIAL_TEMPLATE_VERSION,
} from '../make/payload'

/** Story va dayjest — bitta Instagram hisobi, faqat lotin yozuvi. */
export const INSTAGRAM_SCRIPT: Locale = 'uz-Latn'
/** Instagram karuseli: ko'pi bilan 10 slayd (muqova + 9 post). */
export const INSTAGRAM_CAROUSEL_MAX = 10
export const INSTAGRAM_DIGEST_MAX_POSTS = INSTAGRAM_CAROUSEL_MAX - 1
/** Instagram caption'ida ko'pi bilan 30 heshteg (oshsa — API xato beradi). */
export const INSTAGRAM_HASHTAG_LIMIT = 30
/** Dayjest caption'idagi chaqiruv (havola caption'da bosilmaydi). */
export const INSTAGRAM_DIGEST_CTA = 'Havola profilda.'
/**
 * Kunlik limitga shuncha qolganda faqat muhim (`digestPriority` > 0) postlar story'si yuboriladi.
 */
export const STORY_PRIORITY_HEADROOM = 5

const SCRIPT_SUFFIX: Record<Locale, 'latn' | 'cyrl'> = { 'uz-Latn': 'latn', 'uz-Cyrl': 'cyrl' }

// ---------------------------------------------------------------------------
// Kunlik limit
// ---------------------------------------------------------------------------

export interface StoryBudgetInput {
  /** Oxirgi 24 soatdagi Instagram nashrlari: story + alohida post + dayjest karusellari. */
  used: number
  /** Shulardan dayjest karusellari (zaxiradan ayiriladi). */
  digestsSent: number
  /** Kunlik dayjest slotlari soni (zaxira). */
  digestSlots: number
  /** `instagramDailyLimit` (standart 50). */
  limit: number
  /** Postning `digestPriority` (0–3). */
  priority: number
}

export interface StoryBudget {
  allowed: boolean
  /** Story uchun chegara: limit − hali yuborilmagan dayjest slotlari. */
  cap: number
  reason?: 'daily-limit' | 'daily-limit-low-priority'
}

/**
 * Story yuborish mumkinmi (Instagram API — hisobga 24 soatda 50 ta nashr, story ham):
 *
 * - zaxira = kunlik dayjest slotlari − oxirgi 24 soatda yuborilgan dayjestlar (≥ 0);
 * - `used ≥ limit − zaxira` — story yuborilmaydi (`daily-limit`);
 * - chegaraga {@link STORY_PRIORITY_HEADROOM} ta qolganda — faqat muhimligi > 0 postlar
 *   (`daily-limit-low-priority`).
 *
 * Story o'tkazib yuborilsa ham post dayjestga tushadi.
 */
export function storyBudget(input: StoryBudgetInput): StoryBudget {
  const reserve = Math.max(0, input.digestSlots - input.digestsSent)
  const cap = Math.max(0, input.limit - reserve)
  if (input.used >= cap) return { allowed: false, cap, reason: 'daily-limit' }
  if ((input.priority || 0) <= 0 && input.used >= cap - STORY_PRIORITY_HEADROOM) {
    return { allowed: false, cap, reason: 'daily-limit-low-priority' }
  }
  return { allowed: true, cap }
}

// ---------------------------------------------------------------------------
// Caption
// ---------------------------------------------------------------------------

export interface DigestCaptionItem {
  title: string
  socialTitle?: string | null
  metaTitle?: string | null
}

/**
 * Dayjest caption'i:
 *
 * ```
 * Kun yangiliklari · 10-oktabr
 *
 * 1. Sarlavha 1
 * 2. Sarlavha 2
 *
 * Havola profilda.
 *
 * #Texnologiya #AI #BlogOdya
 * ```
 *
 * ≤ `limit` (2200) belgi: sig'masa — sarlavhalar pog'onama-pog'ona qisqaradi, keyin heshteglar
 * tushiriladi (bandlar soni o'zgarmaydi — slaydlar bilan mos); heshteglar ≤ 30.
 */
export function instagramDigestCaption(input: {
  header: string
  items: readonly DigestCaptionItem[]
  cta?: string | null
  hashtags?: readonly string[]
  limit?: number
}): string {
  const limit = input.limit ?? INSTAGRAM_CAPTION_LIMIT
  const hashtags = (input.hashtags ?? []).slice(0, INSTAGRAM_HASHTAG_LIMIT)
  const build = (max: number, tags: readonly string[]) =>
    [
      input.header.trim(),
      input.items.map((item, index) => `${index + 1}. ${digestItemTitle(item, max)}`).join('\n'),
      input.cta?.trim(),
      tags.join(' '),
    ]
      .filter(Boolean)
      .join('\n\n')
  let last = ''
  for (const tags of hashtags.length ? [hashtags, []] : [[]]) {
    for (const max of DIGEST_TITLE_LEVELS) {
      last = build(max, tags)
      if (charLength(last) <= limit) return last
    }
  }
  // Amalda yetib kelinmaydi (9 × 24 belgi ≪ 2200) — baribir chegaradan oshmasin.
  return [...last].slice(0, limit).join('')
}

// ---------------------------------------------------------------------------
// Muqova slaydi URL'i
// ---------------------------------------------------------------------------

export interface DigestCoverParams {
  script: Locale
  /** Slot (epoch ms) — muqovadagi sana. */
  slotAt: number
  /** Dayjestdagi postlar (tartib bo'yicha). */
  postIds: readonly number[]
}

function coverSignature(params: DigestCoverParams, secret: string): string {
  return createHmac('sha256', secret)
    .update(
      [
        SCRIPT_SUFFIX[params.script],
        params.slotAt,
        params.postIds.join('.'),
        SOCIAL_TEMPLATE_VERSION,
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 16)
}

/**
 * Muqova slaydi: `/og/{latn|cyrl}/digest/cover.jpg?at=…&p=1.2.3&v=…&s=…` — deterministik (slot +
 * postlar), ommaviy (`/og/**` — Meta crawler'i oladi), imzo (`s`, HMAC — Payload siri) begona
 * parametrlar bilan render qildirishning oldini oladi.
 */
export function digestCoverUrl(
  options: DigestCoverParams & { origin: string; secret: string },
): string {
  const url = new URL(
    `/og/${SCRIPT_SUFFIX[options.script]}/digest/cover.jpg`,
    `${options.origin.replace(/\/+$/, '')}/`,
  )
  url.searchParams.set('at', String(options.slotAt))
  url.searchParams.set('p', options.postIds.join('.'))
  url.searchParams.set('v', String(SOCIAL_TEMPLATE_VERSION))
  url.searchParams.set('s', coverSignature(options, options.secret))
  return url.toString()
}

/** Route uchun: parametrlarni o'qiydi va imzoni tekshiradi; noto'g'ri — `null`. */
export function parseDigestCoverUrl(
  script: Locale,
  search: URLSearchParams,
  secret: string,
): DigestCoverParams | null {
  const at = search.get('at') ?? ''
  const p = search.get('p') ?? ''
  if (!/^\d{1,15}$/.test(at) || !/^\d{1,12}(\.\d{1,12}){0,9}$/.test(p)) return null
  if (search.get('v') !== String(SOCIAL_TEMPLATE_VERSION)) return null
  const params: DigestCoverParams = {
    script,
    slotAt: Number(at),
    postIds: p.split('.').map(Number),
  }
  const expected = coverSignature(params, secret)
  const signature = search.get('s') ?? ''
  if (signature.length !== expected.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0 ? params : null
}

// ---------------------------------------------------------------------------
// Make JSON (`type: "digest"`)
// ---------------------------------------------------------------------------

export interface DigestSlide {
  /** Ommaviy JPEG (4:5). */
  imageUrl: string
  title: string
  /** Muqova — bosh sahifa, post slaydi — maqola (UTM bilan). */
  url: string
  /** Muqova slaydi — `null`. */
  postId: number | null
}

export interface MakeDigestPayload {
  version: number
  type: 'digest'
  event: 'digest.published'
  test: boolean
  deliveryId: string
  sentAt: string
  script: Locale
  digest: {
    key: string
    slotAt: string
    /** "Kun yangiliklari · 10-oktabr". */
    title: string
    /** Post slaydlari soni (muqovasiz). */
    count: number
  }
  /** Muqova + postlar (≤ 10) — Make'da Iterator → "Create a Carousel Post". */
  slides: DigestSlide[]
  caption: string
  hashtags: string[]
  instagram: { caption: string; imageUrls: string[] }
}

export interface DigestPayloadPost extends DigestCaptionItem {
  id: number
  imageUrl: string
  url: string
}

export function buildDigestPayload(input: {
  key: string
  slotAt: number
  /** Sarlavha qatori: "Kun yangiliklari · 10-oktabr". */
  header: string
  cover: { imageUrl: string; url: string }
  posts: readonly DigestPayloadPost[]
  hashtags: readonly string[]
  cta?: string | null
  test: boolean
  deliveryId: string
  sentAt: string
  script: Locale
}): MakeDigestPayload {
  const posts = input.posts.slice(0, INSTAGRAM_DIGEST_MAX_POSTS)
  const hashtags = input.hashtags.slice(0, INSTAGRAM_HASHTAG_LIMIT)
  const caption = instagramDigestCaption({
    header: input.header,
    items: posts,
    cta: input.cta === undefined ? INSTAGRAM_DIGEST_CTA : input.cta,
    hashtags,
  })
  const slides: DigestSlide[] = [
    { imageUrl: input.cover.imageUrl, title: input.header, url: input.cover.url, postId: null },
    ...posts.map((post) => ({
      imageUrl: post.imageUrl,
      title: post.title.trim(),
      url: post.url,
      postId: post.id,
    })),
  ]
  return {
    version: MAKE_PAYLOAD_VERSION,
    type: 'digest',
    event: 'digest.published',
    test: input.test,
    deliveryId: input.deliveryId,
    sentAt: input.sentAt,
    script: input.script,
    digest: {
      key: input.key,
      slotAt: new Date(input.slotAt).toISOString(),
      title: input.header,
      count: posts.length,
    },
    slides,
    caption,
    hashtags,
    instagram: { caption, imageUrls: slides.map((slide) => slide.imageUrl) },
  }
}

/** Sarlavha qatori: "Kun yangiliklari · 10-oktabr" (kirill — "Кун янгиликлари · 10 октябр"). */
export function digestHeader(locale: Locale, date: string): string {
  return `${locale === 'uz-Cyrl' ? 'Кун янгиликлари' : 'Kun yangiliklari'} · ${date}`
}
