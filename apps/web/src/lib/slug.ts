/**
 * Vaqtinchalik (minimal) slug yordamchilari. To'liq o'zbekcha slugify (`packages/shared/slugify-uz`,
 * TZ §8.1) — M1-03 da; u tayyor bo'lgach `toSlug` shu funksiyaga almashtiriladi.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const SLUG_MAX_LENGTH = 80

/** URL'da band qilingan segmentlar (`/kr` — kirill prefiksi, TZ §3.6). */
export const RESERVED_SLUGS = ['kr', 'admin', 'api'] as const

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
  if (value === null || value === undefined || value === '') return true
  if (typeof value !== 'string' || !SLUG_PATTERN.test(value)) {
    return 'Slug: faqat kichik lotin harflari, raqamlar va "-" (masalan, "suniy-intellekt")'
  }
  if (value.length > SLUG_MAX_LENGTH) return `Slug ${SLUG_MAX_LENGTH} belgidan oshmasligi kerak`
  if ((RESERVED_SLUGS as readonly string[]).includes(value)) {
    return `"${value}" slug'i band qilingan`
  }
  return true
}
