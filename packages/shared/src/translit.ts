/**
 * Lotin → kirill transliteratsiya adapteri (TZ §3.6).
 *
 * Harf darajasidagi asosiy qoidalar — npm `lotin-kirill` (MIT) kutubxonasining `latinToCyrillic`
 * funksiyasi (`sh/ch/oʻ/gʻ/ye/yo/yu/ya`, so'z boshidagi `e → э`, tutuq belgisi → `ъ`, `s'h → сҳ`).
 * Kutubxonaning `Transliterator.textToCyrillic` matn darajasida ishlatilmaydi: so'zlarga ajratish,
 * himoyalangan bo'laklar va istisnolar shu adapterda — kutubxonani almashtirish yoki o'z qoidalar
 * jadvalimizga o'tish kerak bo'lsa, faqat `transliterateWordCore` o'zgaradi.
 *
 * Tartib:
 *  1. Himoyalangan bo'laklar aniqlanadi va o'zgarmaydi: inline kod (`` `...` ``), URL, e-mail,
 *     `@mention`, `#hashtag`, glossariydagi `doNotTransliterate` atamalar (brendlar).
 *  2. Qolgan matnda apostrof variantlari (`ʻ ' ‘ ’ ʼ ` ´`) normallashtiriladi: `o/g` dan keyin —
 *     `ʻ` (U+02BB), harflar orasida — tutuq belgisi `ʼ` (U+02BC).
 *  3. Har bir so'z uchun: avval `whole_word` istisnosi, keyin eng uzun `prefix` istisnosi
 *     (qolgan qismi oddiy qoidalar bilan), bo'lmasa — oddiy qoidalar. Katta-kichik harf farqlanmaydi,
 *     natijada asl so'zning bosh harfi (yoki butunlay katta harf) saqlanadi.
 *  4. Chet so'zlar lotinda qoladi: `w`, `ch` siz `c`, diakritikali harflar, ichki katta harf
 *     (`iPhone`, `OnePlus`), rim raqamlari (`XXI`), raqamga yopishgan katta harfli model nomlari.
 *
 * Kutubxona kamchiliklari adapterda tuzatilgan: unli harfdan keyingi `e → э` (`poeziya`, `duel`),
 * butunlay katta harfli so'zlar, `ts → ц` va yumshoq belgi — istisnolar lug'ati orqali.
 */
import { latinToCyrillic } from 'lotin-kirill'

// ---------------------------------------------------------------------------
// Apostroflar
// ---------------------------------------------------------------------------

/** `oʻ`/`gʻ` belgisi — MODIFIER LETTER TURNED COMMA (U+02BB). */
export const OKINA = 'ʻ'
/** Tutuq (ayirish) belgisi — MODIFIER LETTER APOSTROPHE (U+02BC). */
export const TUTUQ = 'ʼ'
/** Amalda uchraydigan barcha apostrof variantlari: `ʻ ʼ ' ‘ ’ ` ´`. */
export const APOSTROPHE_VARIANTS = ['ʻ', 'ʼ', "'", '‘', '’', '`', '´'] as const

const APOS_CLASS = "[\\u02BB\\u02BC'\\u2018\\u2019`\\u00B4]"
const OG_APOSTROPHE_RE = new RegExp(`([oOgG])${APOS_CLASS}`, 'g')
const TUTUQ_RE = new RegExp(`(?<=\\p{L})(?<![oOgG])${APOS_CLASS}(?=\\p{L})`, 'gu')
const APOS_RE = new RegExp(APOS_CLASS)

/**
 * Apostroflarni normallashtiradi: `o/g` dan keyingi har qanday variant → `ʻ` (U+02BB),
 * boshqa harflar orasidagi variant → `ʼ` (U+02BC). So'z chetidagi qo'shtirnoqlarga tegilmaydi.
 */
export function normalizeApostrophes(text: string): string {
  return text.replace(OG_APOSTROPHE_RE, `$1${OKINA}`).replace(TUTUQ_RE, TUTUQ)
}

export function isApostrophe(char: string | undefined): boolean {
  return char !== undefined && char.length === 1 && APOS_RE.test(char)
}

// ---------------------------------------------------------------------------
// Istisnolar va glossariy
// ---------------------------------------------------------------------------

export type TranslitMatchType = 'whole_word' | 'prefix'

/** `translit-exceptions` yozuvi (seed yoki DB). */
export interface TranslitExceptionInput {
  latin: string
  cyrillic: string
  matchType: TranslitMatchType
}

/** Glossariy yozuvi (seed yoki DB) — faqat transliteratsiya uchun kerakli maydonlar. */
export interface GlossaryTermInput {
  term: string
  language?: string
  doNotTransliterate?: boolean | null
}

/** Istisno kaliti: normallashtirilgan apostroflar + kichik harf. */
export const exceptionKey = (latin: string): string =>
  normalizeApostrophes(latin.trim()).toLowerCase()

/** Glossariy kaliti: atama + til (katta-kichik harf farqlanmaydi). */
export const glossaryTermKey = (item: GlossaryTermInput): string =>
  `${item.term.trim().toLowerCase()}\u0000${item.language ?? ''}`

/**
 * Seed va DB istisnolarini birlashtiradi: keyingi ro'yxat oldingisini kalit bo'yicha almashtiradi
 * (DB yozuvi seed'dan ustun).
 */
export function mergeTranslitExceptions(
  ...lists: ReadonlyArray<readonly TranslitExceptionInput[] | null | undefined>
): TranslitExceptionInput[] {
  const byKey = new Map<string, TranslitExceptionInput>()
  for (const list of lists) {
    for (const item of list ?? []) {
      if (!item?.latin || !item.cyrillic) continue
      byKey.set(`${item.matchType}\u0000${exceptionKey(item.latin)}`, item)
    }
  }
  return [...byKey.values()]
}

/**
 * Glossariydan `doNotTransliterate` atamalarini oladi. Keyingi ro'yxat oldingisidan ustun
 * (masalan, admin DB'da seed brendining belgisini olib tashlagan bo'lsa, atama himoyalanmaydi).
 */
export function protectedTermsFromGlossary(
  ...lists: ReadonlyArray<readonly GlossaryTermInput[] | null | undefined>
): string[] {
  const byKey = new Map<string, GlossaryTermInput>()
  for (const list of lists) {
    for (const item of list ?? []) {
      if (!item?.term?.trim()) continue
      byKey.set(glossaryTermKey(item), item)
    }
  }
  const terms = new Set<string>()
  for (const item of byKey.values()) {
    if (item.doNotTransliterate) terms.add(item.term.trim())
  }
  return [...terms]
}

// ---------------------------------------------------------------------------
// Harf darajasi
// ---------------------------------------------------------------------------

const LATIN_VOWEL_BEFORE_E_RE = /(?<=[aeiouAEIOU])[eE]/g
const HAS_LOWER_RE = /\p{Ll}/u
const HAS_UPPER_RE = /\p{Lu}/u
const LETTERS_RE = /\p{L}/gu

function isAllUpper(word: string): boolean {
  const letters = word.match(LETTERS_RE) ?? []
  return letters.length > 1 && !letters.some((ch) => HAS_LOWER_RE.test(ch))
}

/**
 * Bitta so'zni (istisnolarsiz) o'giradi — `lotin-kirill` + adapter tuzatishlari.
 * Kirish apostroflari allaqachon normallashtirilgan bo'lishi kerak.
 */
function transliterateWordCore(word: string): string {
  // Unli harfdan keyingi `e` → `э` (poeziya → поэзия, duel → дуэль); kutubxona faqat so'z boshini
  // hisobga oladi. Kirill harflari kutubxonadan o'zgarishsiz o'tadi.
  const prepared = word.replace(LATIN_VOWEL_BEFORE_E_RE, (e) => (e === 'e' ? 'э' : 'Э'))
  const result = latinToCyrillic(prepared)
  return isAllUpper(word) ? result.toUpperCase() : result
}

/**
 * So'z davomini (prefiks istisnosidan keyingi qismini) o'giradi: so'z boshi qoidalari
 * (`e → э`) qo'llanmasligi uchun oldidan kontekst harfi qo'yiladi (unli → `a`, undosh → `b`;
 * ikkalasi ham kutubxonada digraf boshlamaydi).
 */
function transliterateContinuation(rest: string, previous: string): string {
  if (!rest) return ''
  const context = /[aeiouAEIOU]$/.test(previous) ? 'a' : 'b'
  return transliterateWordCore(context + rest).slice(1)
}

/** Istisno kirill shakliga asl so'zning registrini beradi. */
function applyCase(source: string, cyrillic: string): string {
  if (isAllUpper(source)) return cyrillic.toUpperCase()
  const first = source.match(/\p{L}/u)?.[0]
  if (!first || !cyrillic) return cyrillic
  const head = HAS_UPPER_RE.test(first) ? cyrillic[0]!.toUpperCase() : cyrillic[0]!.toLowerCase()
  return head + cyrillic.slice(1)
}

// ---------------------------------------------------------------------------
// Chet so'zlar
// ---------------------------------------------------------------------------

const ROMAN_RE = /^M{0,4}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/
const FOREIGN_LETTER_RE = /[wW]|[cC](?![hH])|[^A-Za-zʻʼ-]/
const CAMEL_RE = /[a-z][A-Z]/

/** Lotinda qoladigan so'zmi (chet so'z, brend ko'rinishidagi yozuv, rim raqami, model nomi)? */
function shouldKeepLatin(word: string, before: string | undefined, after: string | undefined) {
  if (FOREIGN_LETTER_RE.test(word)) return true
  if (CAMEL_RE.test(word)) return true
  if (word.length >= 2 && ROMAN_RE.test(word)) return true
  const nearDigit = /\d/.test(before ?? '') || /\d/.test(after ?? '')
  return nearDigit && HAS_UPPER_RE.test(word) && !/[a-z]/.test(word)
}

// ---------------------------------------------------------------------------
// Himoyalangan bo'laklar
// ---------------------------------------------------------------------------

type Range = [start: number, end: number]

const INLINE_CODE_RE = /(?<!\p{L})`[^`\n]+`(?!\p{L})/gu
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"`«»]+/giu
const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu
const DOMAIN_RE =
  /(?<![\p{L}\p{N}@.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:uz|com|org|net|io|ru|ai|dev|app|gg|tv|me|co|info|edu|gov|so|xyz|news|tech)\b(?:\/[^\s<>"'`«»]*)?/giu
const MENTION_RE = /(?<![\p{L}\p{N}_@.])@[A-Za-z0-9_]{2,}/gu
const HASHTAG_RE = /(?<![\p{L}\p{N}_#&])#[\p{L}\p{N}_]+/gu
const TRAILING_PUNCT_RE = /[.,;:!?)\]}»"']+$/

/** Qo'shimchalar: brendga to'g'ridan-to'g'ri qo'shilganda (`Googlening`, `Samsungdan`). */
const BRAND_SUFFIXES = [
  'lar',
  'ning',
  'ni',
  'niki',
  'ga',
  'ka',
  'qa',
  'da',
  'ta',
  'dan',
  'tan',
  'dagi',
  'tagi',
  'gacha',
  'dek',
  'day',
  'cha',
  'i',
  'si',
  'im',
  'imiz',
  'ing',
  'ingiz',
  'dir',
  'mi',
  'chi',
  'li',
  'lik',
  'siz',
] as const

function isSuffixChain(value: string): boolean {
  if (!value) return false
  const ok: boolean[] = new Array<boolean>(value.length + 1).fill(false)
  ok[0] = true
  for (let i = 0; i < value.length; i++) {
    if (!ok[i]) continue
    for (const suffix of BRAND_SUFFIXES) {
      if (value.startsWith(suffix, i)) ok[i + suffix.length] = true
    }
  }
  return ok[value.length] === true
}

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}]/u.test(ch)

interface TermIndex {
  byFirstChar: Map<string, string[]>
}

function buildTermIndex(terms: readonly string[]): TermIndex {
  const byFirstChar = new Map<string, string[]>()
  const sorted = [...new Set(terms.map((t) => t.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  )
  for (const term of sorted) {
    const first = term[0]!
    byFirstChar.set(first, [...(byFirstChar.get(first) ?? []), term])
  }
  return { byFirstChar }
}

/**
 * Glossariy atamalari (katta-kichik harf farqlanadi, butun so'z sifatida). 3+ belgili atamaga
 * o'zbekcha qo'shimcha yopishishi mumkin (`ChatGPTdan`) — qo'shimcha o'giriladi, atama emas.
 */
function findTermRanges(text: string, index: TermIndex): Range[] {
  const ranges: Range[] = []
  let i = 0
  while (i < text.length) {
    const candidates = index.byFirstChar.get(text[i]!)
    if (!candidates || isWordChar(text[i - 1])) {
      i++
      continue
    }
    let matchedEnd = -1
    for (const term of candidates) {
      if (!text.startsWith(term, i)) continue
      const end = i + term.length
      const next = text[end]
      if (!isWordChar(next) && !isApostrophe(next)) {
        matchedEnd = end
        break
      }
      if (term.length < 3) continue
      const hasApostrophe = isApostrophe(next)
      const suffix = /^[a-z]+/.exec(text.slice(hasApostrophe ? end + 1 : end))?.[0] ?? ''
      const afterSuffix = text[(hasApostrophe ? end + 1 : end) + suffix.length]
      if (isSuffixChain(suffix) && !isWordChar(afterSuffix)) {
        matchedEnd = hasApostrophe ? end + 1 : end
        break
      }
    }
    if (matchedEnd > i) {
      ranges.push([i, matchedEnd])
      i = matchedEnd
    } else {
      i++
    }
  }
  return ranges
}

function regexRanges(text: string, re: RegExp, trimPunctuation = false): Range[] {
  const ranges: Range[] = []
  for (const match of text.matchAll(re)) {
    let value = match[0]
    if (trimPunctuation) value = value.replace(TRAILING_PUNCT_RE, '')
    if (value) ranges.push([match.index, match.index + value.length])
  }
  return ranges
}

function addRanges(target: Range[], candidates: Range[]): void {
  for (const candidate of candidates) {
    const overlaps = target.some(([s, e]) => candidate[0] < e && s < candidate[1])
    if (!overlaps) target.push(candidate)
  }
}

// ---------------------------------------------------------------------------
// Transliterator
// ---------------------------------------------------------------------------

export interface TransliteratorOptions {
  /** Istisnolar (seed + DB). Takroriy kalitlarda oxirgisi ustun. */
  exceptions?: readonly TranslitExceptionInput[]
  /** O'girilmaydigan atamalar (glossariy `doNotTransliterate`). */
  protectedTerms?: readonly string[]
  /** `#hashtag` o'zgarishsiz qoladi (default: true). */
  preserveHashtags?: boolean
}

export interface Transliterator {
  /** Oddiy matnni lotindan kirillga o'giradi. */
  toCyrillic(text: string): string
  /** Bitta so'zni (himoyalangan bo'laklarsiz) o'giradi. */
  word(word: string): string
}

const WORD_RE = /[A-Za-zÀ-ɏ](?:[A-Za-zÀ-ɏʻ]|ʼ(?=[A-Za-z])|-(?=[A-Za-z]))*/g

export function createTransliterator(options: TransliteratorOptions = {}): Transliterator {
  const wholeWords = new Map<string, string>()
  const prefixes: Array<{ key: string; cyrillic: string }> = []
  const prefixByKey = new Map<string, string>()
  for (const item of options.exceptions ?? []) {
    const key = exceptionKey(item.latin)
    if (!key) continue
    if (item.matchType === 'prefix') prefixByKey.set(key, item.cyrillic)
    else wholeWords.set(key, item.cyrillic)
  }
  for (const [key, cyrillic] of prefixByKey) prefixes.push({ key, cyrillic })
  prefixes.sort((a, b) => b.key.length - a.key.length)

  const termIndex = buildTermIndex(options.protectedTerms ?? [])
  const preserveHashtags = options.preserveHashtags ?? true

  function fromExceptions(word: string): string | undefined {
    const lower = word.toLowerCase()
    const whole = wholeWords.get(lower)
    if (whole !== undefined) return applyCase(word, whole)
    for (const { key, cyrillic } of prefixes) {
      if (lower.startsWith(key)) {
        const head = word.slice(0, key.length)
        return applyCase(head, cyrillic) + transliterateContinuation(word.slice(key.length), head)
      }
    }
    return undefined
  }

  function word(input: string, before?: string, after?: string): string {
    const normalized = normalizeApostrophes(input)
    if (shouldKeepLatin(normalized, before, after)) return input
    const fromTable = fromExceptions(normalized)
    if (fromTable !== undefined) return fromTable
    if (normalized.includes('-')) {
      return normalized
        .split('-')
        .map((part) => (part ? word(part) : part))
        .join('-')
    }
    return transliterateWordCore(normalized)
  }

  function plain(segment: string): string {
    const normalized = normalizeApostrophes(segment)
    return normalized.replace(WORD_RE, (token, offset: number) =>
      word(token, normalized[offset - 1], normalized[offset + token.length]),
    )
  }

  function toCyrillic(text: string): string {
    if (!text) return text
    const ranges: Range[] = []
    addRanges(ranges, regexRanges(text, INLINE_CODE_RE))
    addRanges(ranges, regexRanges(text, URL_RE, true))
    addRanges(ranges, regexRanges(text, EMAIL_RE))
    addRanges(ranges, regexRanges(text, DOMAIN_RE, true))
    addRanges(ranges, regexRanges(text, MENTION_RE))
    if (preserveHashtags) addRanges(ranges, regexRanges(text, HASHTAG_RE))
    addRanges(ranges, findTermRanges(text, termIndex))
    ranges.sort((a, b) => a[0] - b[0])

    let out = ''
    let cursor = 0
    for (const [start, end] of ranges) {
      out += plain(text.slice(cursor, start)) + text.slice(start, end)
      cursor = end
    }
    return out + plain(text.slice(cursor))
  }

  return { toCyrillic, word: (w) => word(w) }
}
