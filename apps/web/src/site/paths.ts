/**
 * Ommaviy sayt URL sxemasi (TZ §3.6, §8.1).
 *
 * Lotin — ildizda (`/`, `/{category}`, `/{category}/{slug}`), kirill — `/kr` prefiksi bilan.
 * Slug ikkala yozuvda bir xil (lotin), shuning uchun boshqa yozuvdagi URL — faqat prefiksni
 * almashtirish. Bu fayl yon ta'sirsiz: server, client va testlarda ishlatiladi.
 */
import { LOCALE_PATH_PREFIX, LOCALES, type Locale } from '@blog-odya/shared'

import { withLocalePrefix } from '@/lib/preferences'

/** Kategoriya sahifalash segmenti: `/{category}/page/{n}` (TZ §8.1). */
export const PAGE_SEGMENT = 'page'

export function homePath(locale: Locale): string {
  return withLocalePrefix(locale, '/')
}

/** `/{category}` yoki `/{category}/page/{n}` (n ≥ 2). */
export function categoryPath(locale: Locale, categorySlug: string, page = 1): string {
  const base = `/${categorySlug}`
  return withLocalePrefix(locale, page > 1 ? `${base}/${PAGE_SEGMENT}/${page}` : base)
}

export function postPath(locale: Locale, categorySlug: string, slug: string): string {
  return withLocalePrefix(locale, `/${categorySlug}/${slug}`)
}

function paged(base: string, page: number): string {
  return page > 1 ? `${base}/${PAGE_SEGMENT}/${page}` : base
}

/** `/tag/{slug}` yoki `/tag/{slug}/page/{n}` (n ≥ 2). */
export function tagPath(locale: Locale, slug: string, page = 1): string {
  return withLocalePrefix(locale, paged(`/tag/${slug}`, page))
}

/** `/author/{slug}` yoki `/author/{slug}/page/{n}` (n ≥ 2). */
export function authorPath(locale: Locale, slug: string, page = 1): string {
  return withLocalePrefix(locale, paged(`/author/${slug}`, page))
}

/** Statik sahifa (`pages`): `/{slug}`. */
export function pagePath(locale: Locale, slug: string): string {
  return withLocalePrefix(locale, `/${slug}`)
}

/** Qidiruv: `/search?q=…&page=n` (`/kr/search`). So'rovsiz — faqat forma. */
export function searchPath(locale: Locale, query?: string, page = 1): string {
  const params = new URLSearchParams()
  const q = query?.trim()
  if (q) params.set('q', q)
  if (q && page > 1) params.set('page', String(page))
  const search = params.toString()
  return withLocalePrefix(locale, `/search${search ? `?${search}` : ''}`)
}

/** Lotin (prefiksiz) ichki yo'l → joriy yozuvdagi yo'l; tashqi URL o'zgarishsiz. */
export function localizePath(locale: Locale, path: string): string {
  return path.startsWith('/') && !path.startsWith('//') ? withLocalePrefix(locale, path) : path
}

/** Yo'l qaysi yozuvga tegishli: `/kr` yoki `/kr/...` — kirill, qolgani — lotin. */
export function localeFromPathname(pathname: string): Locale {
  for (const locale of LOCALES) {
    const prefix = LOCALE_PATH_PREFIX[locale]
    if (prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`))) return locale
  }
  return 'uz-Latn'
}

/** Yozuv prefiksisiz (lotin) yo'l: `/kr/texnologiyalar` → `/texnologiyalar`, `/kr` → `/`. */
export function stripLocalePrefix(pathname: string): string {
  const prefix = LOCALE_PATH_PREFIX[localeFromPathname(pathname)]
  if (!prefix) return pathname || '/'
  const rest = pathname.slice(prefix.length)
  return rest === '' ? '/' : rest
}

/**
 * Joriy sahifaning ikkala yozuvdagi URL'i (almashtirgich, keyin — hreflang, M1-06).
 * Query/hash saqlanadi: `/kibersport/page/2?x=1` ↔ `/kr/kibersport/page/2?x=1`.
 */
export function alternatePaths(pathname: string): Record<Locale, string> {
  const match = /^([^?#]*)(.*)$/.exec(pathname)
  const path = match?.[1] || '/'
  const suffix = match?.[2] ?? ''
  const neutral = stripLocalePrefix(path)
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, `${withLocalePrefix(locale, neutral)}${suffix}`]),
  ) as Record<Locale, string>
}

/** `/page/{n}` parametri: faqat butun son ≥ 2 (1-sahifa — kanonik `/{category}`). */
export function parsePageParam(value: string): number | null {
  if (!/^[1-9]\d{0,5}$/.test(value)) return null
  return Number(value)
}
