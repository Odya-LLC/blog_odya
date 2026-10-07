/**
 * Ijtimoiy rasm ustidagi qisqa sarlavha (OBLOG-94) — sof funksiyalar (unit testlar bilan).
 *
 * - Manba: `socialTitle` (≤ 70 belgi) → bo'lmasa `title` (≤ 70) → `meta.title` (≤ 70) →
 *   `title` dan aqlli qisqartirish (":" / " — " gacha qism yoki so'z bo'yicha "…").
 * - Sig'dirish: shrift o'lchami pog'onama-pog'ona kichrayadi, so'z bo'yicha ko'chiriladi,
 *   eng kichik o'lchamda ham sig'masa — oxirgi qator "…" bilan qisqaradi.
 */
import { type FontMetrics, measureText } from './font-metrics'

export const SOCIAL_TITLE_MAX = 70
/** Aqlli qisqartirishda ":" gacha qism kamida shuncha belgi bo'lsin (aks holda mazmunsiz). */
const MIN_PREFIX = 18

const chars = (text: string) => [...text].length

/** Bo'shliqlarni yig'adi, oxiridagi nuqta va brend qo'shimchasini olib tashlaydi. */
export function cleanSocialTitle(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*[—–|-]\s*(Blog Odya|Блог Одя)$/i, '')
    .replace(/(?<![.…])\.$/, '')
    .trim()
}

/** So'z chegarasida `max` belgigacha qisqartirib, "…" qo'shadi. */
export function truncateWords(text: string, max: number): string {
  if (chars(text) <= max) return text
  const cut = [...text].slice(0, max - 1).join('')
  const space = cut.lastIndexOf(' ')
  const base = space >= max * 0.5 ? cut.slice(0, space) : cut
  return `${base.replace(/[\s,;:—–-]+$/, '')}…`
}

/** Uzun sarlavha → qisqa: ajratgichgacha bo'lgan qism (≥ 18 belgi) yoki so'z bo'yicha "…". */
export function shortenTitle(title: string, max = SOCIAL_TITLE_MAX): string {
  const text = cleanSocialTitle(title)
  if (chars(text) <= max) return text
  const separators = [': ', ' — ', ' – ', ' | ', '. ', '; ']
  for (const separator of separators) {
    const index = text.indexOf(separator)
    if (index < 0) continue
    const prefix = text.slice(0, index).trim()
    if (chars(prefix) >= MIN_PREFIX && chars(prefix) <= max) return prefix
  }
  return truncateWords(text, max)
}

export interface SocialTitleSource {
  socialTitle?: string | null
  title?: string | null
  metaTitle?: string | null
}

/** Rasm uchun qisqa sarlavha (yuqoridagi tartib). */
export function resolveSocialTitle(source: SocialTitleSource, max = SOCIAL_TITLE_MAX): string {
  const social = cleanSocialTitle(source.socialTitle)
  if (social) return chars(social) <= max ? social : truncateWords(social, max)
  const title = cleanSocialTitle(source.title)
  if (title && chars(title) <= max) return title
  const meta = cleanSocialTitle(source.metaTitle)
  if (meta && chars(meta) <= max) return meta
  return shortenTitle(title || meta, max)
}

export interface FitOptions {
  /** Qator eni (px). */
  width: number
  maxLines: number
  /** Kattadan kichikka. */
  sizes: readonly number[]
  letterSpacingEm?: number
}

export interface FittedTitle {
  fontSize: number
  lines: string[]
  /** `true` — matn qisqartirildi ("…"). */
  truncated: boolean
}

/** Juda uzun so'zni (URL, uzun nom) belgilar bo'yicha bo'ladi. */
function splitLongWord(
  word: string,
  fits: (text: string) => boolean,
): { head: string; rest: string } {
  const letters = [...word]
  let end = letters.length
  while (end > 1 && !fits(letters.slice(0, end).join(''))) end--
  return { head: letters.slice(0, end).join(''), rest: letters.slice(end).join('') }
}

/** So'z bo'yicha ochko'z ko'chirish. */
export function wrapWords(text: string, fits: (line: string) => boolean): string[] {
  const words = text.split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    const candidate = current ? `${current} ${word}` : word
    if (fits(candidate)) {
      current = candidate
      continue
    }
    if (current) {
      lines.push(current)
      current = ''
      i--
      continue
    }
    // Bitta so'z qatorga sig'maydi — bo'lib yuboriladi.
    const { head, rest } = splitLongWord(word, fits)
    lines.push(head)
    if (rest) words.splice(i + 1, 0, rest)
  }
  if (current) lines.push(current)
  return lines
}

/** Oxirgi qatorni "…" bilan sig'diradi. */
function ellipsize(line: string, fits: (text: string) => boolean): string {
  let text = line.replace(/[\s,;:—–-]+$/, '')
  while (text && !fits(`${text}…`)) {
    const space = text.lastIndexOf(' ')
    text =
      space > 0 && chars(text) - space < 12 ? text.slice(0, space) : [...text].slice(0, -1).join('')
    text = text.replace(/[\s,;:—–-]+$/, '')
  }
  return `${text}…`
}

/**
 * Sarlavhani `maxLines` qatorga sig'diradi: birinchi sig'gan (eng katta) o'lcham; hech biri
 * sig'masa — eng kichik o'lchamda birinchi `maxLines` qator, oxirgisi "…" bilan.
 */
export function fitTitle(text: string, metrics: FontMetrics, options: FitOptions): FittedTitle {
  const clean = text.replace(/\s+/g, ' ').trim()
  const spacing = options.letterSpacingEm ?? 0
  const sizes = options.sizes.length ? options.sizes : [48]
  for (const fontSize of sizes) {
    const fits = (line: string) => measureText(metrics, line, fontSize, spacing) <= options.width
    const lines = wrapWords(clean, fits)
    if (lines.length <= options.maxLines) return { fontSize, lines, truncated: false }
  }
  const fontSize = sizes[sizes.length - 1]!
  const fits = (line: string) => measureText(metrics, line, fontSize, spacing) <= options.width
  const lines = wrapWords(clean, fits).slice(0, options.maxLines)
  lines[lines.length - 1] = ellipsize(lines[lines.length - 1]!, fits)
  return { fontSize, lines, truncated: true }
}
