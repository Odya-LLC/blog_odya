/**
 * Qidiruv matnini normallashtirish (TZ §3.6 "so'rov yozuvi avtomatik aniqlanadi", §7).
 *
 * Lotin va kirill matn bitta "lotin ASCII" ko'rinishiga keltiriladi — shunda kirill so'rov lotin
 * maqolani (va aksincha) topadi, `oʻ`/`o'`/`o‘`/`o’` variantlari bir xil bo'ladi:
 *
 * 1. kirill bosh harflari → kichik, keyin `toLowerCase()`;
 * 2. apostrof variantlari (ʻ ʼ ' ‘ ’ ` ´ ʹ ′) olib tashlanadi (`oʻ` → `o`, `gʻ` → `g`, `taʼlim` → `talim`);
 * 3. kirill → lotin: ё→yo, ю→yu, я→ya, ц→ts, ч→ch, ш/щ→sh, ў→o, қ→q, ғ→g, ҳ→h, х→x, ж→j,
 *    ъ/ь — tashlanadi;
 * 4. `ye` → `e` (kirill `е` so'z boshida lotinda `ye`: `Европа` ↔ `Yevropa`);
 * 5. `[a-z0-9]` dan boshqa hamma narsa — bitta bo'shliq.
 *
 * **Postgres'dagi `oblog_search_normalize()` bilan aynan bir xil** (migratsiya
 * `20260924_113406_m1_07_search`); moslik `tests/search.int.test.ts` da tekshiriladi.
 * Yon ta'sirsiz — server va testlarda ishlatiladi.
 */

const UPPER_CYRILLIC = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯЎҚҒҲ'
const LOWER_CYRILLIC = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяўқғҳ'

const APOSTROPHES = /[ʻʼ'‘’`´ʹ′]/g

const MULTI: ReadonlyArray<readonly [string, string]> = [
  ['ё', 'yo'],
  ['ю', 'yu'],
  ['я', 'ya'],
  ['ц', 'ts'],
  ['ч', 'ch'],
  ['ш', 'sh'],
  ['щ', 'sh'],
]

const SINGLE_FROM = 'абвгдежзийклмнопрстуфхыэўқғҳ'
const SINGLE_TO = 'abvgdejziyklmnoprstufxieoqgh'
/** `translate()` da juftsiz qolgan belgilar o'chiriladi. */
const DROPPED = new Set(['ъ', 'ь'])

const SINGLE = new Map<string, string>(
  [...SINGLE_FROM].map((char, index) => [char, SINGLE_TO[index] ?? '']),
)

const UPPER = new Map<string, string>(
  [...UPPER_CYRILLIC].map((char, index) => [char, LOWER_CYRILLIC[index] ?? char]),
)

function mapChars(input: string, map: Map<string, string>, dropped?: Set<string>): string {
  let result = ''
  for (const char of input) {
    if (dropped?.has(char)) continue
    result += map.get(char) ?? char
  }
  return result
}

export function normalizeSearchText(input: string | null | undefined): string {
  if (!input) return ''
  let text = mapChars(input, UPPER).toLowerCase().replace(APOSTROPHES, '')
  for (const [from, to] of MULTI) text = text.split(from).join(to)
  text = mapChars(text, SINGLE, DROPPED).split('ye').join('e')
  return text.replace(/[^a-z0-9]+/g, ' ').trim()
}

/** So'rovning maksimal uzunligi (belgilar) — undan keyingisi kesiladi. */
export const SEARCH_QUERY_MAX_LENGTH = 100

/** Normallashtirilgan so'rovning minimal uzunligi (1 harfli so'rov qidirilmaydi). */
export const SEARCH_QUERY_MIN_LENGTH = 2

/** URL'dagi `q` parametri → ko'rsatiladigan so'rov (bo'shliqlar siqilgan, uzunligi cheklangan). */
export function cleanSearchQuery(raw: string | string[] | null | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  return [...(value ?? '').replace(/\s+/g, ' ').trim()]
    .slice(0, SEARCH_QUERY_MAX_LENGTH)
    .join('')
    .trim()
}

/** So'rov qidirishga yaroqlimi (normallashtirilgandan keyin kamida 2 belgi). */
export function isSearchableQuery(query: string): boolean {
  return normalizeSearchText(query).replace(/ /g, '').length >= SEARCH_QUERY_MIN_LENGTH
}
