/**
 * Telegram avtopost xabari (TZ §7.1) — sof funksiyalar (DB/tarmoqsiz, unit testlar bilan).
 *
 * Xabar `telegram-settings.template` shablonidan (HTML, `parse_mode: HTML`) yig'iladi:
 * `{{title}}`, `{{excerpt}}`, `{{url}}`, `{{hashtags}}`. Foydalanuvchi matni (sarlavha, lid,
 * teglar) escape qilinadi; shablonning o'zi — admin (ishonchli) HTML'i.
 *
 * Uzunlik Telegram qoidasi bo'yicha — **ko'rinadigan** matn (teglarsiz, entity'lar bitta belgi,
 * UTF-16 birliklarida): caption ≤ 1024, oddiy xabar ≤ 4096. Oshsa — avval lid qisqartiriladi
 * (so'z chegarasida, `…`), keyin (juda uzun sarlavhada) sarlavha, oxirida heshteglar tushiriladi.
 */
import { createHash } from 'node:crypto'

import type { Locale } from '@blog-odya/shared/locales'

import { escapeTelegramHtml } from '@/lib/telegram'
import { postPath } from '@/site/paths'

/** `sendPhoto` caption chegarasi. */
export const CAPTION_LIMIT = 1024
/** `sendMessage` matn chegarasi. */
export const MESSAGE_LIMIT = 4096

export type TelegramMessageKind = 'photo' | 'text'

export const MESSAGE_LIMITS: Record<TelegramMessageKind, number> = {
  photo: CAPTION_LIMIT,
  text: MESSAGE_LIMIT,
}

/** UTM `utm_campaign`: kanal yozuvi. */
export const UTM_CAMPAIGN: Record<Locale, string> = {
  'uz-Latn': 'latn',
  'uz-Cyrl': 'cyrl',
}

export const DEFAULT_HASHTAGS_COUNT = 3

/**
 * Post havolasi: lotin — `/{category}/{slug}`, kirill — `/kr/{category}/{slug}` +
 * `utm_source=telegram&utm_medium=channel&utm_campaign=latn|cyrl`.
 */
export function buildPostUrl(options: {
  origin: string
  locale: Locale
  categorySlug: string
  slug: string
}): string {
  const url = new URL(
    postPath(options.locale, options.categorySlug, options.slug),
    `${options.origin.replace(/\/+$/, '')}/`,
  )
  url.searchParams.set('utm_source', 'telegram')
  url.searchParams.set('utm_medium', 'channel')
  url.searchParams.set('utm_campaign', UTM_CAMPAIGN[options.locale])
  return url.toString()
}

/** Tutuq/o'kina belgilari — heshteg ichida bo'lmaydi (Telegram uni uzib qo'yadi). */
const APOSTROPHES = /[ʻʼ'‘’`´]/g

/**
 * Teg/kategoriya nomi → heshteg: `Sun'iy intellekt` → `#SuniyIntellekt`, `Кибер спорт` →
 * `#КиберСпорт`, `AI` → `#AI`. Harf bo'lmasa (faqat raqam/belgi) — `null`.
 */
export function toHashtag(name: string): string | null {
  const words = name
    .normalize('NFC')
    .replace(APOSTROPHES, '')
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean)
  if (words.length === 0) return null
  const joined =
    words.length === 1
      ? words[0]!
      : words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')
  if (!/\p{L}/u.test(joined)) return null
  return `#${joined}`
}

/** Nomlardan (tartib bo'yicha: teglar, keyin kategoriya) `count` tagacha noyob heshteg. */
export function buildHashtags(names: readonly (string | null | undefined)[], count: number) {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const name of names) {
    if (tags.length >= count) break
    const tag = name ? toHashtag(name) : null
    if (!tag) continue
    const key = tag.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  return tags
}

const ENTITY_RE = /&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos));/gi
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Telegram hisoblaydigan uzunlik: HTML teglarsiz, entity'lar ochilgan, UTF-16 birliklarda. */
export function visibleLength(html: string): number {
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(ENTITY_RE, (_, dec: string, hex: string, name: string) => {
      if (name) return NAMED[name.toLowerCase()] ?? '?'
      const code = dec ? Number(dec) : parseInt(hex, 16)
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : '?'
    })
  return text.length
}

/** Matnni `max` belgigacha (`…` bilan) qisqartiradi — iloji bo'lsa so'z chegarasida. */
export function truncateText(text: string, max: number): string {
  const value = text.trim()
  if (value.length <= max) return value
  if (max <= 0) return ''
  if (max === 1) return '…'
  let cut = value.slice(0, max - 1)
  // Surrogat juftini (emoji) yarmida kesmaslik.
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1)
  const space = cut.search(/\s\S*$/)
  if (space >= Math.floor((max - 1) * 0.6)) cut = cut.slice(0, space)
  return `${cut.replace(/[\s,.;:–—-]+$/u, '')}…`
}

/** Shablondagi o'rinbosar yoki HTML teg/entity — o'zgartirilmaydigan bo'laklar. */
const TEMPLATE_TOKEN_RE = /(<[^>]*>|\{\{\s*\w+\s*\}\}|&[#\w]+;)/g

/**
 * Shablonning oddiy matn qismlariga `transform` (kirill kanal uchun transliteratsiya:
 * `Batafsil:` → `Батафсил:`). Teglar, entity'lar va `{{…}}` o'zgarishsiz.
 */
export function transformTemplateText(template: string, transform: (text: string) => string) {
  return template
    .split(TEMPLATE_TOKEN_RE)
    .map((part, index) => (index % 2 === 1 || !part ? part : transform(part)))
    .join('')
}

export interface CaptionValues {
  title: string
  excerpt?: string | null
  url: string
  hashtags?: readonly string[]
}

/** O'rinbosarlarni qo'yadi (qiymatlar escape qilinadi) va bo'sh qatorlarni yig'adi. */
export function renderTemplate(template: string, values: CaptionValues): string {
  const map: Record<string, string> = {
    title: escapeTelegramHtml(values.title.trim()),
    excerpt: escapeTelegramHtml((values.excerpt ?? '').trim()),
    url: escapeTelegramHtml(values.url),
    hashtags: escapeTelegramHtml((values.hashtags ?? []).join(' ')),
  }
  return template
    .replace(/\r\n?/g, '\n')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => map[key] ?? match)
    .replace(/<b>\s*<\/b>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Chegaraga sig'adigan xabar: to'liq → lid qisqartirilgan → lidsiz, sarlavha qisqartirilgan →
 * heshteglarsiz. Oxirgi holatda ham oshsa (shablonning o'zi juda uzun) — `null`.
 */
export function buildMessageText(
  template: string,
  values: CaptionValues,
  limit: number,
): string | null {
  const fits = (html: string) => visibleLength(html) <= limit
  const full = renderTemplate(template, values)
  if (fits(full)) return full

  const excerpt = (values.excerpt ?? '').trim()
  if (excerpt) {
    const without = renderTemplate(template, { ...values, excerpt: '' })
    // Lid bo'sh qatorlari bilan birga yo'qolishi mumkin — shuning uchun qidiruv bilan.
    const room = limit - visibleLength(without)
    for (let max = Math.min(excerpt.length - 1, room); max >= 16;) {
      const html = renderTemplate(template, { ...values, excerpt: truncateText(excerpt, max) })
      if (fits(html)) return html
      max -= Math.max(1, visibleLength(html) - limit)
    }
  }

  for (const hashtags of [values.hashtags ?? [], []]) {
    const base = { ...values, excerpt: '', hashtags }
    const withoutTitle = renderTemplate(template, { ...base, title: '' })
    const room = limit - visibleLength(withoutTitle)
    if (room < 1) continue
    for (let max = Math.min(values.title.length, room); max >= 1;) {
      const html = renderTemplate(template, { ...base, title: truncateText(values.title, max) })
      if (fits(html)) return html
      max -= Math.max(1, visibleLength(html) - limit)
    }
  }
  return null
}

type SizeLike = { url?: string | null } | null | undefined
export type CoverLike = {
  url?: string | null
  sizes?: Partial<Record<string, SizeLike>> | null
} | null

/** Muqova rasmi URL'i: `og` (1200×630) → `hero` (1280) → asl fayl; nisbiy bo'lsa — to'liq. */
export function coverPhotoUrl(media: CoverLike | number | string | undefined, origin: string) {
  if (!media || typeof media !== 'object') return null
  const raw = media.sizes?.og?.url || media.sizes?.hero?.url || media.url
  if (!raw) return null
  try {
    return new URL(raw, `${origin.replace(/\/+$/, '')}/`).toString()
  } catch {
    return null
  }
}

/** Kanal xabari havolasi: `@kanal` → `t.me/kanal/ID`, `-100…` → `t.me/c/…/ID`; boshqa — `null`. */
export function telegramMessageLink(
  chatId: string | null | undefined,
  messageId: string | null | undefined,
): string | null {
  const id = messageId?.trim()
  const chat = chatId?.trim()
  if (!id || !/^\d+$/.test(id) || !chat) return null
  if (/^@\w{4,}$/.test(chat)) return `https://t.me/${chat.slice(1)}/${id}`
  const internal = /^-100(\d+)$/.exec(chat)
  return internal ? `https://t.me/c/${internal[1]}/${id}` : null
}

/** Yuborilgan matn xeshi — sarlavha/lid/havola o'zgarganini aniqlash (tahrirlash) uchun. */
export function messageHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32)
}
