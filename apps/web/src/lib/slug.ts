/**
 * Vaqtinchalik (minimal) slug yordamchilari. To'liq o'zbekcha slugify (`packages/shared/slugify-uz`,
 * TZ §8.1) — M1-03 da; u tayyor bo'lgach `toSlug` shu funksiyaga almashtiriladi.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const SLUG_MAX_LENGTH = 80

/** URL'da band qilingan segmentlar (`/kr` — kirill prefiksi, TZ §3.6). */
export const RESERVED_SLUGS = ['kr', 'admin', 'api'] as const

/**
 * Ildiz darajasidagi (`/{slug}`) marshrutlar bilan to'qnashadigan slug'lar — kategoriya va statik
 * sahifa (`pages`) uchun band (TZ §8.1, M1-07): kirill prefiksi, admin/API, sayt marshrutlari
 * (`/tag/…`, `/author/…`, `/search`, `/bot`, `/{category}/page/{n}`), SEO fayllari (`/feeds`,
 * `/og`, `/sitemaps`), `public/` papkalari va `/styleguide`.
 */
export const TOP_LEVEL_RESERVED_SLUGS = [
  ...RESERVED_SLUGS,
  'tag',
  'author',
  'search',
  'bot',
  'page',
  'feeds',
  'og',
  'sitemaps',
  'styleguide',
  'brand',
  'rss',
] as const

export type SlugValidationOptions = {
  /** Ildiz darajasidagi URL (`/{slug}`): kategoriya va statik sahifa. */
  topLevel?: boolean
}

/** Apostrof variantlari (U+02BB, U+02BC, ASCII, U+2018, U+2019, backtick) — slug'da tashlanadi. */
const APOSTROPHES = /[ʻʼ'‘’`]/g

/** Diakritik belgilar (NFKD dan keyin). */
const DIACRITICS = /[̀-ͯ]/g

export function toSlug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .replace(APOSTROPHES, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')
}

/** Payload `validate` uchun: `true` yoki xato matni. */
export function validateSlug(value: unknown, options: SlugValidationOptions = {}): true | string {
  if (value === null || value === undefined || value === '') return true
  if (typeof value !== 'string' || !SLUG_PATTERN.test(value)) {
    return 'Slug: faqat kichik lotin harflari, raqamlar va "-" (masalan, "suniy-intellekt")'
  }
  if (value.length > SLUG_MAX_LENGTH) return `Slug ${SLUG_MAX_LENGTH} belgidan oshmasligi kerak`
  const reserved: readonly string[] = options.topLevel ? TOP_LEVEL_RESERVED_SLUGS : RESERVED_SLUGS
  if (reserved.includes(value)) {
    return `"${value}" slug'i band qilingan (sayt marshruti)`
  }
  return true
}

/**
 * Ildiz darajasidagi slug'lar bitta nomlar fazosida: kategoriya `/{slug}` va statik sahifa
 * `/{slug}` bir xil bo'lsa, biri ikkinchisini yashiradi. Qaysi kolleksiyalar bilan solishtiriladi.
 */
export const TOP_LEVEL_SLUG_COLLECTIONS = ['categories', 'pages'] as const

export type TopLevelSlugCollection = (typeof TOP_LEVEL_SLUG_COLLECTIONS)[number]

export function topLevelCollisionMessage(value: string, other: TopLevelSlugCollection): string {
  const label = other === 'categories' ? 'kategoriya' : 'statik sahifa'
  return `"${value}" slug'i ${label} tomonidan band (URL /${value} to'qnashadi)`
}
