/**
 * Ommaviy sayt marshrutlari (TZ §8.1) — bitta optional catch-all (`[[...path]]`) segmentlaridan:
 *
 * - `[]`                        → bosh sahifa
 * - `[slug]`                    → kategoriya (1-sahifa) yoki statik sahifa (`pages`) — kategoriya
 *                                 ustun; slug'lar to'qnashmaydi (`slugField({ uniqueAcross })`)
 * - `[category, 'page', n]`     → kategoriya, n-sahifa (`1` → kanonik URL'ga redirect)
 * - `[category, slug]`          → maqola
 * - `['tag', slug]`, `['tag', slug, 'page', n]`       → teg sahifasi
 * - `['author', slug]`, `['author', slug, 'page', n]` → muallif sahifasi
 * - `['bot']`                   → OdyaBlogBot haqida (User-Agent havolasi, M2-02)
 * - `['yangiliklar']`, `['yangiliklar', 'page', n]` → barcha yangiliklar arxivi (OBLOG-68)
 *
 * `tag`, `author`, `bot`, `yangiliklar`, `search` … — band qilingan slug'lar (`ROUTE_RESERVED_SLUGS`), shuning
 * uchun bunday kategoriya yoki sahifa bo'lmaydi. `/search` — alohida papka (`searchParams`
 * o'qiydi, dinamik; catch-all ISR'da qoladi).
 *
 * Nega catch-all: `next build` DB'ga ulanmaydi (OBLOG-31) — `/` va `/kr` ham boshqa sahifalar kabi
 * birinchi so'rovda chiziladi va ISR'da keshlanadi (`generateStaticParams` → `[]`).
 * Yon ta'sirsiz — unit testlanadi.
 */
import { ARCHIVE_SEGMENT, PAGE_SEGMENT, parsePageParam } from './paths'

/** Sahifalanadigan taksonomiya ro'yxatlari: `/{kind}/{slug}` (`/page/{n}` bilan). */
export type ListingKind = 'tag' | 'author'

export type SiteRoute =
  | { kind: 'home' }
  | { kind: 'category'; category: string; page: number }
  | { kind: 'category-first-page'; category: string }
  | { kind: 'article'; category: string; slug: string }
  | { kind: ListingKind; slug: string; page: number }
  | { kind: 'listing-first-page'; listing: ListingKind; slug: string }
  | { kind: 'bot' }
  | { kind: 'archive'; page: number }
  | { kind: 'archive-first-page' }
  | { kind: 'not-found' }

/** Slug segmenti: kichik lotin harflari, raqamlar, `-` (bot so'rovlari DB'ga yetib bormaydi). */
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const LISTINGS: readonly string[] = ['tag', 'author'] satisfies ListingKind[]

const NOT_FOUND: SiteRoute = { kind: 'not-found' }

function resolveListing(listing: ListingKind, rest: readonly string[]): SiteRoute {
  const [slug, pageSegment, pageValue] = rest
  if (!slug || !SEGMENT.test(slug)) return NOT_FOUND
  if (rest.length === 1) return { kind: listing, slug, page: 1 }
  if (rest.length !== 3 || pageSegment !== PAGE_SEGMENT || !pageValue) return NOT_FOUND
  const page = parsePageParam(pageValue)
  if (page === null) return NOT_FOUND
  return page === 1 ? { kind: 'listing-first-page', listing, slug } : { kind: listing, slug, page }
}

/** `/yangiliklar` (`/page/{n}` bilan); boshqa har qanday davomi — 404. */
function resolveArchive(rest: readonly string[]): SiteRoute {
  if (rest.length === 0) return { kind: 'archive', page: 1 }
  const [pageSegment, pageValue] = rest
  if (rest.length !== 2 || pageSegment !== PAGE_SEGMENT || !pageValue) return NOT_FOUND
  const page = parsePageParam(pageValue)
  if (page === null) return NOT_FOUND
  return page === 1 ? { kind: 'archive-first-page' } : { kind: 'archive', page }
}

export function resolveSiteRoute(segments: readonly string[] | undefined): SiteRoute {
  const parts = segments ?? []
  if (parts.length === 0) return { kind: 'home' }
  const [category, second, third] = parts
  if (!category || !SEGMENT.test(category) || parts.length > 4) return NOT_FOUND
  if (LISTINGS.includes(category)) return resolveListing(category as ListingKind, parts.slice(1))
  if (category === ARCHIVE_SEGMENT) return resolveArchive(parts.slice(1))
  if (parts.length > 3) return NOT_FOUND
  // Statik sahifalar kategoriya slug'idan ustun (bunday kategoriya yaratilmasligi kerak).
  if (parts.length === 1 && category === 'bot') return { kind: 'bot' }
  if (parts.length === 1) return { kind: 'category', category, page: 1 }
  if (parts.length === 2) {
    return second && SEGMENT.test(second) ? { kind: 'article', category, slug: second } : NOT_FOUND
  }
  if (second !== PAGE_SEGMENT || !third) return NOT_FOUND
  const page = parsePageParam(third)
  if (page === null) return NOT_FOUND
  return page === 1
    ? { kind: 'category-first-page', category }
    : { kind: 'category', category, page }
}
