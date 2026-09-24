/**
 * SEO sozlamalari (TZ §8.2, §8.3): sayt manzili, brend nomlari, indekslashga ruxsat.
 * Yon ta'sirsiz modul — server kodi, route handler'lar va unit testlarda ishlatiladi.
 */
import type { Locale } from '@blog-odya/shared'

type RawEnv = Record<string, string | undefined>

/** Brend nomi yozuv bo'yicha (TZ §10.15, brend README). */
export const BRAND_NAME: Record<Locale, string> = {
  'uz-Latn': 'Blog Odya',
  'uz-Cyrl': 'Блог Одя',
}

/** `<title>` qo'shimchasi: `{seoTitle} — Blog Odya` / `— Блог Одя` (TZ §8.2). */
export const TITLE_SEPARATOR = ' — '

/** Tashkilot (publisher) — Odya LLC (TZ §8.3 E-E-A-T). */
export const ORGANIZATION = {
  legalName: 'Odya LLC',
  /** `public/brand/icon-512.png` — kvadrat belgi (design/brand/icons/blue). */
  logoPath: '/brand/icon-512.png',
  logoSize: 512,
} as const

/** `og:locale` (TZ §8.2): ikkala yozuv ham o'zbek tili — `uz_UZ`. */
export const OG_LOCALE = 'uz_UZ'

/** Google News nashr nomi — Publisher Center'dagi nom bilan aynan bir xil bo'lishi kerak. */
export const NEWS_PUBLICATION_NAME = 'Blog Odya'
/** Google News `news:language` — ISO 639 (yozuvdan qat'i nazar `uz`). */
export const NEWS_LANGUAGE = 'uz'

/** Teg sahifasi shu sondan kam postda `noindex` (TZ §8.1). M1-07 ham shu qiymatni ishlatadi. */
export const TAG_INDEX_MIN_POSTS = 3

const DEFAULT_SITE_URL = 'http://localhost:3000'

/** Sayt manzili (oxirida `/` siz): `NEXT_PUBLIC_SITE_URL`, masalan `https://blog.odya.uz`. */
export function siteOrigin(source: RawEnv = process.env): string {
  const raw = source.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL
  try {
    return new URL(raw).origin
  } catch {
    return DEFAULT_SITE_URL
  }
}

/** Ichki yo'l yoki nisbiy media URL → to'liq URL; to'liq URL o'zgarishsiz qaytadi. */
export function absoluteUrl(pathOrUrl: string, origin: string = siteOrigin()): string {
  return new URL(pathOrUrl, `${origin}/`).toString()
}

/**
 * Qidiruv tizimlari indekslashi mumkinmi (TZ §8.3; acceptance: preview'da `Disallow: /` va
 * `noindex`):
 * - `SEO_NOINDEX=1|true` — majburan yopiq (masalan, Contabo staging);
 * - Vercel'da (`VERCEL_ENV` bor) — faqat `production` ochiq, `preview`/`development` yopiq;
 * - Vercel'dan tashqarida (lokal, Contabo production) — ochiq.
 */
export function isIndexingAllowed(source: RawEnv = process.env): boolean {
  const flag = source.SEO_NOINDEX?.trim().toLowerCase()
  if (flag === '1' || flag === 'true') return false
  if (source.VERCEL_ENV) return source.VERCEL_ENV === 'production'
  return true
}

/** Yozuvning OG/JSON-LD dagi qisqa kodi: `latn` / `cyrl` (OG route: `/og/{script}/…`). */
export type Script = 'latn' | 'cyrl'

export const LOCALE_SCRIPT: Record<Locale, Script> = { 'uz-Latn': 'latn', 'uz-Cyrl': 'cyrl' }

export function localeFromScript(script: string): Locale | null {
  if (script === 'latn') return 'uz-Latn'
  if (script === 'cyrl') return 'uz-Cyrl'
  return null
}
