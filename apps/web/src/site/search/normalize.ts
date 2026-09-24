/**
 * Qidiruv normalizatsiyasi (TZ §3.6 "FTS ikkala locale bo'yicha; so'rov yozuvi avtomatik
 * aniqlanadi", §8.1 `/search?q=`).
 *
 * Indekslangan matn ham, foydalanuvchi so'rovi ham bitta **qidiruv kaliti**ga keltiriladi:
 *
 * 1. kichik harf;
 * 2. kirill → lotin (ko'p harfli moslar: `ш→sh`, `ч→ch`, `я→ya`, `ю→yu`, `ё→yo`, `ц→ts`, `щ→sh`;
 *    bir harflilar: `ў→o`, `ғ→g`, `қ→q`, `ҳ→h`, `х→x`, `ж→j`, `й→y`, `ы→i`, `э→e` …);
 * 3. apostrof variantlari va `ъ`/`ь` olib tashlanadi: `oʻ`/`o'`/`o‘`/`o’`/`o\``, `gʻ`/`g'`,
 *    `sunʼiy`/`sun'iy`/`сунъий` — barchasi bitta shaklga (`o`, `g`, `suniy`);
 * 4. `ye` → `e` (kirill `е` so'z boshida lotinda `ye`, o'rtada `e` — kalitda farq qilmaydi);
 * 5. harf/raqamdan boshqa hamma narsa — bo'shliq.
 *
 * Shu sababli kirill so'rovi lotin matnni ham topadi (kirill maydoni hali bo'sh bo'lsa ham),
 * `oʻ`/`o'` yozilishidan qat'i nazar. Kalit faqat qidiruv uchun (ko'rsatilmaydi).
 *
 * **Muhim:** xuddi shu qoidalar SQL'da — `odya_search_normalize()` funksiyasi
 * (`migrations/*_m1_07_search.ts`, `SEARCH_NORMALIZE_SQL`). Biri o'zgarsa, ikkinchisi ham
 * o'zgartiriladi va yangi migratsiya yoziladi; integratsion test ikkisini solishtiradi.
 *
 * Yon ta'sirsiz — unit testlanadi.
 */

/** Apostrof variantlari: U+02BB ʻ, U+02BC ʼ, ASCII ', U+2018 ‘, U+2019 ’, backtick, U+00B4 ´, U+02B9 ʹ. */
export const SEARCH_APOSTROPHES = "ʻʼ'‘’`´ʹ"

/** Ko'p harfli kirill → lotin moslari (bir harflilardan oldin qo'llanadi). */
export const CYRILLIC_MULTI: ReadonlyArray<readonly [string, string]> = [
  ['ш', 'sh'],
  ['щ', 'sh'],
  ['ч', 'ch'],
  ['я', 'ya'],
  ['ю', 'yu'],
  ['ё', 'yo'],
  ['ц', 'ts'],
]

/** Bir harfli kirill → lotin moslari (`translate()` uchun — tartib muhim). */
export const CYRILLIC_SINGLE_FROM = 'абвгдезийклмнопрстуфхэыжқғўҳ'
export const CYRILLIC_SINGLE_TO = 'abvgdeziyklmnoprstufxeijqgoh'

/** Olib tashlanadigan belgilar: apostroflar va yumshoq/qattiq belgi. */
export const SEARCH_DROPPED = `${SEARCH_APOSTROPHES}ьъ`

const SINGLE = new Map(
  [...CYRILLIC_SINGLE_FROM].map((char, index) => [char, CYRILLIC_SINGLE_TO[index] ?? '']),
)
const DROPPED = new Set([...SEARCH_DROPPED])

/** So'rov uzunligi chegarasi (belgilar) — undan uzuni kesiladi. */
export const SEARCH_QUERY_MAX_LENGTH = 100
/** So'rovdagi so'zlar chegarasi (qolganlari e'tiborsiz). */
export const SEARCH_MAX_TERMS = 8
/** Qidiruv kaliti shu uzunlikdan qisqa bo'lsa — qidirilmaydi (masalan, bitta harf). */
export const SEARCH_MIN_LENGTH = 2

/** Matn → qidiruv kaliti (SQL `odya_search_normalize` bilan bir xil natija). */
export function normalizeSearchText(input: string | null | undefined): string {
  if (!input) return ''
  let text = input.toLowerCase()
  for (const [from, to] of CYRILLIC_MULTI) text = text.split(from).join(to)
  let mapped = ''
  for (const char of text) {
    if (DROPPED.has(char)) continue
    mapped += SINGLE.get(char) ?? char
  }
  return mapped
    .replace(/ye/g, 'e')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Matnda kirill harflari bormi (so'rov yozuvini aniqlash — faqat ko'rsatish uchun). */
export function hasCyrillic(input: string): boolean {
  return /[Ѐ-ӿ]/.test(input)
}

export type SearchQuery = {
  /** Foydalanuvchi kiritgan (qisqartirilgan, bo'shliqlari tozalangan) so'rov — ko'rsatish uchun. */
  display: string
  /** Qidiruv kaliti (normalizatsiya qilingan). */
  normalized: string
  /** Kalit so'zlari (≤ `SEARCH_MAX_TERMS`). */
  terms: string[]
  /** `to_tsquery('simple', …)` uchun: `suniy:* & intellekt:*` (faqat `[a-z0-9]` — xavfsiz). */
  tsquery: string
}

/**
 * `?q=` qiymatini tahlil qiladi. Bo'sh yoki juda qisqa so'rov — `null` (qidirilmaydi).
 * Har bir so'z prefiks sifatida qidiriladi (`intel` → `intellekt`).
 */
export function parseSearchQuery(raw: string | string[] | null | undefined): SearchQuery | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  const display = (value ?? '').replace(/\s+/g, ' ').trim().slice(0, SEARCH_QUERY_MAX_LENGTH)
  const normalized = normalizeSearchText(display)
  if (normalized.length < SEARCH_MIN_LENGTH) return null
  const terms = [...new Set(normalized.split(' ').filter(Boolean))].slice(0, SEARCH_MAX_TERMS)
  if (terms.length === 0) return null
  return {
    display,
    normalized: terms.join(' '),
    terms,
    tsquery: terms.map((term) => `${term}:*`).join(' & '),
  }
}
