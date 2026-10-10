/**
 * Telegram dayjesti (OBLOG-116) — tartiblash, rasm tanlash va caption — sof funksiyalar (DB/tarmoqsiz,
 * unit testlar bilan).
 *
 * Caption (`parse_mode: HTML`, birinchi rasmda — butun galereya ostida ko'rinadi):
 *
 * ```
 * 📰 Kun yangiliklari — 10-oktabr, 15:00
 *
 * 1. <a href="…">Sarlavha 1</a>
 * 2. <a href="…">Sarlavha 2</a>
 *
 * 🔗 Barchasi: <a href="…">odya.uz</a>
 * #Texnologiya #AI
 * ```
 *
 * Chegara — **ko'rinadigan** uzunlik (`visibleLength`: teglar hisoblanmaydi): caption ≤ 1024. Sig'masa —
 * avval uzun sarlavhalar qisqartiriladi (`socialTitle` → sarlavha → SEO sarlavha, `src/social/title.ts`),
 * keyin heshteglar tushiriladi, oxirida — oxirgi bandlar (yangi dayjestda; tahrirlashda bandlar
 * soni o'zgarmaydi — rasmlar tartibi bilan mos qolishi uchun).
 */
import type { Locale } from '@blog-odya/shared/locales'

import { SITE_TIME_ZONE } from '@/lib/format'
import { escapeTelegramHtml } from '@/lib/telegram'
import { cleanSocialTitle, resolveSocialTitle } from '@/social/title'

import { buildHashtags, visibleLength } from './caption'

/** Dayjestga nomzod post (kanal yozuvidagi matn bilan). */
export interface DigestItem {
  id: number
  title: string
  socialTitle?: string | null
  metaTitle?: string | null
  /** Kanal yozuvidagi post havolasi (UTM bilan). */
  url: string
  photoUrl: string | null
  /** `posts.digestPriority` (0–3; bo'sh — 0). */
  priority: number
  publishedAt: string | null
  /** Heshteglar uchun: teglar, keyin kategoriya nomi. */
  tagNames: readonly (string | null | undefined)[]
}

/** Muhimlik (kamayish), keyin chop etilgan vaqt (yangisi oldin), keyin id (barqaror tartib). */
export function orderDigestItems<T extends Pick<DigestItem, 'id' | 'priority' | 'publishedAt'>>(
  items: readonly T[],
): T[] {
  const time = (value: string | null) => (value ? Date.parse(value) || 0 : 0)
  return [...items].sort(
    (a, b) =>
      (b.priority || 0) - (a.priority || 0) ||
      time(b.publishedAt) - time(a.publishedAt) ||
      b.id - a.id,
  )
}

/**
 * Galereya rasmlari: dayjestning birinchi `maxPhotos` bandi muqovalari (tartib — ro'yxat raqami
 * bo'yicha); muqovasiz band o'tkazib yuboriladi.
 */
export function digestPhotos(items: readonly Pick<DigestItem, 'photoUrl'>[], maxPhotos: number) {
  return items
    .slice(0, Math.max(0, maxPhotos))
    .map((item) => item.photoUrl)
    .filter((url): url is string => Boolean(url))
}

/** Dayjest heshteglari: bandlardagi teg/kategoriya nomlari — ko'p uchraganlari oldin. */
export function digestHashtags(items: readonly Pick<DigestItem, 'tagNames'>[], count: number) {
  const counts = new Map<string, { name: string; count: number; first: number }>()
  let index = 0
  for (const item of items) {
    for (const name of new Set(item.tagNames.filter((n): n is string => Boolean(n?.trim())))) {
      const key = name.trim().toLocaleLowerCase()
      const entry = counts.get(key)
      if (entry) entry.count++
      else counts.set(key, { name: name.trim(), count: 1, first: index++ })
    }
  }
  const names = [...counts.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .map((entry) => entry.name)
  return buildHashtags(names, count)
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function format(locale: Locale, options: Intl.DateTimeFormatOptions, date: Date) {
  const key = `${locale}|${JSON.stringify(options)}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { timeZone: SITE_TIME_ZONE, ...options })
    formatters.set(key, formatter)
  }
  return formatter.format(date)
}

/** Slot vaqti: `{ date: '10-oktabr', time: '15:00' }` (kirill — `10 октябр`). */
export function digestDateParts(slotAt: number | string | Date, locale: Locale) {
  const date = new Date(slotAt)
  return {
    date: format(locale, { day: 'numeric', month: 'long' }, date),
    time: format(locale, { hour: '2-digit', minute: '2-digit', hour12: false }, date),
  }
}

const escapeAttribute = (value: string) => escapeTelegramHtml(value).replace(/"/g, '&quot;')

const tidy = (html: string) =>
  html
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/** Sarlavha shabloni: `{{date}}`, `{{time}}` (qiymatlar escape qilinadi; shablon — admin HTML'i). */
export function renderDigestHeader(template: string, values: { date: string; time: string }) {
  const map: Record<string, string> = {
    date: escapeTelegramHtml(values.date),
    time: escapeTelegramHtml(values.time),
  }
  return tidy(template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => map[key] ?? match))
}

/** Pastki qator shabloni: `{{site}}` → sayt havolasi (`<a href="…">odya.uz</a>`). */
export function renderDigestFooter(template: string, site: { url: string; label: string }) {
  const link = `<a href="${escapeAttribute(site.url)}">${escapeTelegramHtml(site.label)}</a>`
  return tidy(template.replace(/\{\{\s*site\s*\}\}/g, link))
}

/** Sarlavha qisqartirish pog'onalari (belgi): to'liq → … → 24. */
export const DIGEST_TITLE_LEVELS = [Number.POSITIVE_INFINITY, 90, 70, 56, 44, 32, 24] as const

const chars = (text: string) => [...text].length

/** Band sarlavhasi `max` belgigacha: to'liq sarlavha sig'sa — o'zi, aks holda qisqa variant. */
export function digestItemTitle(
  item: Pick<DigestItem, 'title' | 'socialTitle' | 'metaTitle'>,
  max: number,
): string {
  const title = item.title.replace(/\s+/g, ' ').trim()
  if (!Number.isFinite(max) || chars(title) <= max) return title
  const short = resolveSocialTitle(
    { socialTitle: item.socialTitle, title, metaTitle: item.metaTitle },
    max,
  )
  return short || cleanSocialTitle(title)
}

export interface DigestCaptionInput {
  /** Tayyor (render qilingan) sarlavha qatori — HTML. */
  header: string
  /** Tayyor pastki qator — HTML. */
  footer: string
  hashtags: readonly string[]
  items: readonly Pick<DigestItem, 'title' | 'socialTitle' | 'metaTitle' | 'url'>[]
  /** Ko'rinadigan belgilar chegarasi (caption — 1024, matnli xabar — 4096). */
  limit: number
  /** `true` — sig'masa oxirgi bandlar tushiriladi (yangi dayjest); `false` — tahrirlash. */
  allowDrop: boolean
}

export interface DigestCaption {
  html: string
  /** Captionga sig'gan bandlar soni (birinchi `count` ta). */
  count: number
}

export function renderDigestCaption(
  input: Pick<DigestCaptionInput, 'header' | 'footer' | 'hashtags' | 'items'>,
  maxTitle: number,
): string {
  const lines = input.items.map(
    (item, index) =>
      `${index + 1}. <a href="${escapeAttribute(item.url)}">${escapeTelegramHtml(
        digestItemTitle(item, maxTitle),
      )}</a>`,
  )
  const tail = [input.footer.trim(), escapeTelegramHtml(input.hashtags.join(' '))]
    .filter(Boolean)
    .join('\n')
  return [input.header.trim(), lines.join('\n'), tail].filter(Boolean).join('\n\n')
}

/**
 * Chegaraga sig'adigan caption: bandlar soni kamayishi bilan (faqat `allowDrop`), har biri uchun —
 * sarlavhalar pog'onama-pog'ona qisqaradi, so'ng heshteglarsiz. Hech biri sig'masa — `null`.
 */
export function buildDigestCaption(input: DigestCaptionInput): DigestCaption | null {
  const total = input.items.length
  if (total === 0) return null
  const minCount = input.allowDrop ? 1 : total
  for (let count = total; count >= minCount; count--) {
    const items = input.items.slice(0, count)
    for (const hashtags of input.hashtags.length ? [input.hashtags, []] : [[]]) {
      for (const max of DIGEST_TITLE_LEVELS) {
        const html = renderDigestCaption({ ...input, items, hashtags }, max)
        if (visibleLength(html) <= input.limit) return { html, count }
      }
    }
  }
  return null
}
