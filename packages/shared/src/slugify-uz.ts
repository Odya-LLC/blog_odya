/**
 * O'zbekcha slug'lar (TZ §8.1, `packages/guidelines/seo.md` §9).
 *
 * - Faqat lotin, kichik harflar, so'zlar `-` bilan; ikkala yozuvda (lotin/kirill) bir xil.
 * - `oʻ/o'/o‘/o’` → `o`, `gʻ` → `g`, tutuq belgisi olib tashlanadi; `sh`/`ch`/`ng` saqlanadi.
 * - Kirill matn avval lotinga o'giriladi (`ш → sh`, `ў → o`, `ғ → g`, `ц → s`/`ts`, ...).
 * - Diakritikalar olib tashlanadi (`é → e`), stop-so'zlar olib tashlanadi (hammasi stop-so'z
 *   bo'lsa — qoldiriladi), uzunlik ≤ 60 belgi (so'z chegarasida kesiladi).
 * - Zaxiralangan slug'lar (`kr`, `tag`, `author`, ...) kategoriya/sahifa slug'i bo'la olmaydi.
 */
import { cyrillicToLatin } from 'lotin-kirill'

export const SLUG_MAX_LENGTH = 60

/**
 * Zaxiralangan slug'lar: URL sxemasidagi (TZ §8.1) va texnik yo'llar bilan to'qnashadiganlar.
 * `kr` — kirill versiyasi prefiksi.
 */
export const RESERVED_SLUGS = [
  'kr',
  'tag',
  'author',
  'search',
  'page',
  'api',
  'admin',
  'feed',
  'rss',
  'sitemap',
  'robots',
  'bot',
  'media',
  'next',
  '_next',
  'static',
  'favicon',
  'manifest',
  'health',
  'preview',
  'amp',
] as const

/** Slug'dan olib tashlanadigan yordamchi so'zlar (o'zbekcha va inglizcha). */
export const SLUG_STOP_WORDS = [
  'va',
  'bilan',
  'uchun',
  'ham',
  'esa',
  'yoki',
  'lekin',
  'ammo',
  'biroq',
  'deb',
  'bu',
  'u',
  'the',
  'a',
  'an',
  'of',
  'and',
  'or',
  'to',
  'in',
  'on',
  'for',
] as const

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const APOSTROPHES_RE = /[ʻʼ'‘’`´]/g
const CYRILLIC_RE = /[Ѐ-ӿ]/
/** O'zbek kirill alifbosida yo'q, lekin rus matnlarida uchraydigan harflar. */
const EXTRA_CYRILLIC: Record<string, string> = { щ: 'sh', ы: 'i', Щ: 'Sh', Ы: 'I' }

export interface SlugifyOptions {
  /** Maksimal uzunlik (default 60). */
  maxLength?: number
  /** Stop-so'zlarni olib tashlash (default true). */
  removeStopWords?: boolean
}

export function slugifyUz(input: string, options: SlugifyOptions = {}): string {
  const maxLength = options.maxLength ?? SLUG_MAX_LENGTH
  let text = String(input ?? '')
  if (CYRILLIC_RE.test(text)) {
    text = text.replace(/[щыЩЫ]/g, (ch) => EXTRA_CYRILLIC[ch] ?? ch)
    // So'zma-so'z: kutubxona so'z boshidagi `е → ye` kabi qoidalarni so'z bo'yicha qo'llaydi.
    text = text.replace(/[Ѐ-ӿ]+/g, (word) => cyrillicToLatin(word))
  }
  text = text
    .replace(APOSTROPHES_RE, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' va ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  let words = text ? text.split('-') : []
  if (options.removeStopWords ?? true) {
    const filtered = words.filter((w) => !(SLUG_STOP_WORDS as readonly string[]).includes(w))
    if (filtered.length > 0) words = filtered
  }
  return truncateSlug(words.join('-'), maxLength)
}

/** Slug'ni so'z chegarasida `maxLength` gacha qisqartiradi. */
export function truncateSlug(slug: string, maxLength = SLUG_MAX_LENGTH): string {
  if (slug.length <= maxLength) return slug
  const cut = slug.slice(0, maxLength + 1)
  const boundary = cut.lastIndexOf('-')
  const result = boundary > 0 ? cut.slice(0, boundary) : slug.slice(0, maxLength)
  return result.replace(/-+$/g, '')
}

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug.trim().toLowerCase())
}

export function isValidSlug(slug: string, maxLength = SLUG_MAX_LENGTH): boolean {
  return SLUG_RE.test(slug) && slug.length <= maxLength
}

/**
 * Payload `validate` uchun: `true` yoki xato matni.
 * `checkReserved` — kategoriya va sahifa slug'lari uchun (post slug'i `/{category}/{slug}` ichida).
 */
export function validateSlug(
  slug: unknown,
  options: { checkReserved?: boolean; maxLength?: number } = {},
): true | string {
  const maxLength = options.maxLength ?? SLUG_MAX_LENGTH
  if (typeof slug !== 'string' || !slug) return 'Slug kiritilishi shart'
  if (slug.length > maxLength) return `Slug ${maxLength} belgidan oshmasligi kerak`
  if (!SLUG_RE.test(slug))
    return 'Slug faqat kichik lotin harflari, raqamlar va "-" dan iborat boʻladi'
  if ((options.checkReserved ?? true) && isReservedSlug(slug)) {
    return `"${slug}" — zaxiralangan slug, boshqasini tanlang`
  }
  return true
}

/**
 * Takrorlanmas slug: `base`, band bo'lsa `base-2`, `base-3`, ... (uzunlik chegarasida).
 * `checkReserved` bo'lsa, zaxiralangan slug ham band hisoblanadi.
 */
export async function dedupeSlug(
  base: string,
  isTaken: (candidate: string) => boolean | Promise<boolean>,
  options: { checkReserved?: boolean; maxLength?: number; maxAttempts?: number } = {},
): Promise<string> {
  const maxLength = options.maxLength ?? SLUG_MAX_LENGTH
  const maxAttempts = options.maxAttempts ?? 1000
  const root = truncateSlug(base, maxLength) || 'post'
  const taken = async (candidate: string) =>
    ((options.checkReserved ?? false) && isReservedSlug(candidate)) || (await isTaken(candidate))

  if (!(await taken(root))) return root
  for (let n = 2; n <= maxAttempts; n++) {
    const suffix = `-${n}`
    const head =
      truncateSlug(root, maxLength - suffix.length).replace(/-+$/g, '') || root.slice(0, 1)
    const candidate = `${head}${suffix}`
    if (!(await taken(candidate))) return candidate
  }
  throw new Error(`Takrorlanmas slug topilmadi: ${root}`)
}
