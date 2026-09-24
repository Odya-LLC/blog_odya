/**
 * Ommaviy sayt marshrutlari (TZ §8.1) — bitta optional catch-all (`[[...path]]`) segmentlaridan:
 *
 * - `[]`                        → bosh sahifa
 * - `[category]`                → kategoriya, 1-sahifa
 * - `[category, 'page', n]`     → kategoriya, n-sahifa (`1` → kanonik URL'ga redirect)
 * - `[category, slug]`          → maqola
 *
 * Nega catch-all: `next build` DB'ga ulanmaydi (OBLOG-31) — `/` va `/kr` ham boshqa sahifalar kabi
 * birinchi so'rovda chiziladi va ISR'da keshlanadi (`generateStaticParams` → `[]`).
 * Keyingi statik marshrutlar (`/tag/…`, `/author/…`, `/search` — M1-07) papka sifatida qo'shiladi
 * va catch-all'dan ustun turadi. Yon ta'sirsiz — unit testlanadi.
 */
import { PAGE_SEGMENT, parsePageParam } from './paths'

export type SiteRoute =
  | { kind: 'home' }
  | { kind: 'category'; category: string; page: number }
  | { kind: 'category-first-page'; category: string }
  | { kind: 'article'; category: string; slug: string }
  | { kind: 'not-found' }

/** Slug segmenti: kichik lotin harflari, raqamlar, `-` (bot so'rovlari DB'ga yetib bormaydi). */
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function resolveSiteRoute(segments: readonly string[] | undefined): SiteRoute {
  const parts = segments ?? []
  if (parts.length === 0) return { kind: 'home' }
  const [category, second, third] = parts
  if (!category || !SEGMENT.test(category) || parts.length > 3) return { kind: 'not-found' }
  if (parts.length === 1) return { kind: 'category', category, page: 1 }
  if (parts.length === 2) {
    return second && SEGMENT.test(second)
      ? { kind: 'article', category, slug: second }
      : { kind: 'not-found' }
  }
  if (second !== PAGE_SEGMENT || !third) return { kind: 'not-found' }
  const page = parsePageParam(third)
  if (page === null) return { kind: 'not-found' }
  return page === 1
    ? { kind: 'category-first-page', category }
    : { kind: 'category', category, page }
}
