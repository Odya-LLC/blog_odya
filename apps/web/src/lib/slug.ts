/**
 * Vaqtinchalik (minimal) slug yordamchilari. To'liq o'zbekcha slugify (`packages/shared/slugify-uz`,
 * TZ §8.1) — M1-03 da; u tayyor bo'lgach `toSlug` shu funksiyaga almashtiriladi.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const SLUG_MAX_LENGTH = 80

/** URL'da band qilingan segmentlar (`/kr` — kirill prefiksi, TZ §3.6). Barcha slug'lar uchun. */
export const RESERVED_SLUGS = ['kr', 'admin', 'api'] as const

/**
 * Ildiz darajasidagi (`/{slug}`) marshrutlar va fayllar: kategoriya va statik sahifa slug'i
 * bular bilan bir xil bo'lolmaydi (TZ §8.1) — aks holda sahifa marshrutni "yopib qo'yadi"
 * yoki marshrut sahifani. `app/` papkalari, `[[...path]]` dispetcheri (`site/route.ts`),
 * SEO fayllari va rewrite'lar (`/rss.xml`, `/sitemap.xml`, `/feeds`, `/og`) bilan mos.
 */
export const ROUTE_RESERVED_SLUGS = [
  ...RESERVED_SLUGS,
  'tag',
  'author',
  'search',
  'bot',
  'page',
  'og',
  'feeds',
  'sitemaps',
  'sitemap',
  'news-sitemap',
  'rss',
  'robots',
  'favicon',
  'manifest',
  'brand',
  'styleguide',
  'graphql',
  'graphql-playground',
  'next',
  'static',
  'media',
  'assets',
] as const

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
export function validateSlug(value: unknown): true | string {
  return validateSlugFormat(value, RESERVED_SLUGS)
}

/**
 * Ildiz darajasidagi slug (kategoriya, statik sahifa — `/{slug}`): format + marshrut nomlari
 * (`ROUTE_RESERVED_SLUGS`). Kategoriya ↔ sahifa to'qnashuvi — `slugField({ uniqueAcross })`.
 */
export function validateRouteSlug(value: unknown): true | string {
  return validateSlugFormat(value, ROUTE_RESERVED_SLUGS)
}

function validateSlugFormat(value: unknown, reserved: readonly string[]): true | string {
  if (value === null || value === undefined || value === '') return true
  if (typeof value !== 'string' || !SLUG_PATTERN.test(value)) {
    return 'Slug: faqat kichik lotin harflari, raqamlar va "-" (masalan, "suniy-intellekt")'
  }
  if (value.length > SLUG_MAX_LENGTH) return `Slug ${SLUG_MAX_LENGTH} belgidan oshmasligi kerak`
  if (reserved.includes(value)) {
    return `"${value}" slug'i band qilingan (sayt marshruti)`
  }
  return true
}

/** Kategoriya ↔ statik sahifa: ikkalasi ham `/{slug}` da — slug bir-biriga to'qnashmasligi kerak. */
export function slugCollisionMessage(value: string, collection: 'categories' | 'pages'): string {
  const what = collection === 'categories' ? 'kategoriya' : 'sahifa'
  return `"${value}" slug'i allaqachon ${what} tomonidan band qilingan (ikkalasi ham /${value} manzilida)`
}
