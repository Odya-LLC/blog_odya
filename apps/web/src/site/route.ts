/**
 * Ommaviy sayt marshrutlari (TZ §8.1) — bitta optional catch-all (`[[...path]]`) segmentlaridan:
 *
 * - `[]`                          → bosh sahifa
 * - `[slug]`                      → kategoriya (1-sahifa) yoki statik sahifa (`pages`, M1-07) —
 *                                   ikkalasi bitta nomlar fazosida (slug to'qnashuvi validatsiyada
 *                                   taqiqlangan, `src/fields/slug.ts`); avval kategoriya qidiriladi
 * - `[category, 'page', n]`       → kategoriya, n-sahifa (`1` → kanonik URL'ga redirect)
 * - `[category, slug]`            → maqola
 * - `['tag', slug]`               → teg (`/tag/{slug}/page/{n}` — sahifalash), M1-07
 * - `['author', slug]`            → muallif (`/author/{slug}/page/{n}`), M1-07
 * - `['bot']`                     → OdyaBlogBot haqida (User-Agent havolasi, M2-02)
 *
 * `/search` — alohida papka (`(latn)/search`, `kr/search`): `searchParams` o'qiydi, shuning uchun
 * dinamik; ISR catch-all ichida bo'lsa "static → dynamic" xatosi bo'lardi.
 *
 * Nega catch-all: `next build` DB'ga ulanmaydi (OBLOG-31) — `/` va `/kr` ham boshqa sahifalar kabi
 * birinchi so'rovda chiziladi va ISR'da keshlanadi (`generateStaticParams` → `[]`).
 * Yon ta'sirsiz — unit testlanadi.
 */
import { PAGE_SEGMENT, parsePageParam } from './paths'

/** Sahifalanadigan ro'yxatlar (kategoriyadan tashqari): `/{prefix}/{slug}[/page/{n}]`. */
export const LISTING_PREFIXES = { tag: 'tag', author: 'author' } as const

export type ListingKind = keyof typeof LISTING_PREFIXES

export type SiteRoute =
  | { kind: 'home' }
  | { kind: 'category'; category: string; page: number }
  | { kind: 'category-first-page'; category: string }
  | { kind: 'article'; category: string; slug: string }
  | { kind: 'tag'; slug: string; page: number }
  | { kind: 'author'; slug: string; page: number }
  | { kind: 'listing-first-page'; listing: ListingKind; slug: string }
  | { kind: 'bot' }
  | { kind: 'not-found' }

/** Slug segmenti: kichik lotin harflari, raqamlar, `-` (bot so'rovlari DB'ga yetib bormaydi). */
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const NOT_FOUND: SiteRoute = { kind: 'not-found' }

function isListing(value: string | undefined): value is ListingKind {
  return value === LISTING_PREFIXES.tag || value === LISTING_PREFIXES.author
}

/** `[slug]` yoki `[slug, 'page', n]` → sahifa raqami (`null` — 404). */
function pageOf(rest: readonly string[]): number | null {
  if (rest.length === 0) return 1
  if (rest.length !== 2 || rest[0] !== PAGE_SEGMENT || !rest[1]) return null
  return parsePageParam(rest[1])
}

function resolveListing(listing: ListingKind, rest: readonly string[]): SiteRoute {
  const [slug, ...paging] = rest
  if (!slug || !SEGMENT.test(slug)) return NOT_FOUND
  const page = pageOf(paging)
  if (page === null) return NOT_FOUND
  if (paging.length > 0 && page === 1) return { kind: 'listing-first-page', listing, slug }
  return { kind: listing, slug, page }
}

export function resolveSiteRoute(segments: readonly string[] | undefined): SiteRoute {
  const parts = segments ?? []
  if (parts.length === 0) return { kind: 'home' }
  const [first, second, third] = parts
  if (!first || !SEGMENT.test(first)) return NOT_FOUND
  if (isListing(first)) return resolveListing(first, parts.slice(1))
  if (parts.length > 3) return NOT_FOUND
  // Statik marshrutlar kategoriya slug'idan ustun (bunday kategoriya yaratib bo'lmaydi).
  if (parts.length === 1 && first === 'bot') return { kind: 'bot' }
  if (parts.length === 1) return { kind: 'category', category: first, page: 1 }
  if (parts.length === 2) {
    return second && SEGMENT.test(second)
      ? { kind: 'article', category: first, slug: second }
      : NOT_FOUND
  }
  if (second !== PAGE_SEGMENT || !third) return NOT_FOUND
  const page = parsePageParam(third)
  if (page === null) return NOT_FOUND
  return page === 1
    ? { kind: 'category-first-page', category: first }
    : { kind: 'category', category: first, page }
}
