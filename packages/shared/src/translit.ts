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
 *  5. OBLOG-67: 2–6 harfli katta harfli qisqartmalar (`GTA`, `ESLning`) lotinda qoladi — o'zbekcha
 *     qisqartmalar (`AQSH`, `BMT`) `whole_word` istisno sifatida o'giriladi; butunlay katta harfli
 *     gapda (sarlavha) qoida o'chadi. Lotin nomlar ketma-ketligida ikki lotin so'z orasidagilar
 *     (`Space Launch Complex`) va qavs ichidagi asl yozilish (`Sem Altman (Sam Altman)`) ham
 *     lotinda qoladi. Post darajasidagi himoya — `withProtectedTerms` (teglar, `keepLatin`).
 *     `toCyrillic(text, suspicious)` — agent uchun shubhali so'zlar ro'yxati.
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

/**
 * Istisno kirill shakliga asl so'zning registrini beradi. Butunlay katta harfli kirill shakli
 * (qisqartma: `AQSH → АҚШ`) har doim shundayligicha qoladi (`AQSh`, `aqsh` → `АҚШ`).
 */
function applyCase(source: string, cyrillic: string): string {
  if (isAllUpper(cyrillic)) return cyrillic
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

/**
 * Qisqartma: 2–6 ta katta lotin harfi (`GTA`, `ESL`, `NIST`). `whole_word` istisnolarida bo'lmasa
 * lotinda qoladi; o'zbekcha qisqartmalar (`AQSH`, `BMT`, `XKS`) istisno sifatida yoziladi va
 * odatdagidek o'giriladi.
 */
const ABBREVIATION_RE = /^[A-Z]{2,6}$/
/** Qisqartma + o'zbekcha qo'shimcha (`ESLning`, `GTAdan`) — qo'shimcha o'giriladi. */
const ABBREVIATION_SUFFIX_RE = /^([A-Z]{2,6})([a-z]+)$/

/**
 * Gap butunlay katta harf bilan yozilgan (sarlavha, `YANGI SHAHAR QURILDI`): qisqartma qoidasi
 * o'chadi, so'zlar odatdagidek o'giriladi. Shart — kichik lotin harfi yo'q va kamida 3 ta katta
 * harfli so'z yoki 6 harfdan uzun katta harfli so'z bor.
 */
function isShoutingText(words: readonly string[], plainText: string): boolean {
  if (/[a-zß-ÿ]/.test(plainText)) return false
  const upper = words.filter((word) => isAllUpper(word))
  return upper.length >= 3 || upper.some((word) => (word.match(LETTERS_RE) ?? []).length > 6)
}

/** Lotin nomlar ketma-ketligida bog'lovchi bo'lishi mumkin bo'lgan inglizcha so'zlar. */
const NAME_CONNECTORS = new Set(['of', 'the', 'and', 'for', 'de', 'von', 'van'])
/** Lotin nom oldidagi artikl (`The Sanctuary`, `The Verge`). */
const LEADING_ARTICLES = new Set(['The'])

// ---------------------------------------------------------------------------
// Shubhali so'zlar (agent uchun ogohlantirish)
// ---------------------------------------------------------------------------

/**
 * Katta harf bilan boshlangan, lekin o'zbekcha ekanligi deyarli aniq bo'lgan so'zlar — shubhali
 * ro'yxatga kiritilmaydi (joy nomlari, tashkilotlar nomidagi so'zlar).
 */
const UZBEK_PROPER_WORDS = new Set(
  [
    'toshkent',
    'samarqand',
    'buxoro',
    'xiva',
    'xorazm',
    'andijon',
    'namangan',
    'navoiy',
    'jizzax',
    'termiz',
    'nukus',
    'urganch',
    'guliston',
    'sirdaryo',
    'surxondaryo',
    'qashqadaryo',
    'rossiya',
    'xitoy',
    'yaponiya',
    'koreya',
    'hindiston',
    'turkiya',
    'germaniya',
    'angliya',
    'britaniya',
    'buyuk',
    'amerika',
    'yevropa',
    'osiyo',
    'afrika',
    'avstraliya',
    'kanada',
    'braziliya',
    'eron',
    'isroil',
    'ukraina',
    'moskva',
    'pekin',
    'tokio',
    'seul',
    'london',
    'parij',
    'berlin',
    'dubay',
    'markaziy',
    'janubiy',
    'shimoliy',
    'sharqiy',
    'respublika',
    'respublikasi',
    'prezident',
    'prezidenti',
    'vazir',
    'vazirlar',
    'vazirligi',
    'mahkamasi',
    'hukumat',
    'hukumati',
    'davlat',
    'milliy',
    'xalqaro',
    'tashkiloti',
    'universiteti',
    'instituti',
    'markazi',
    'banki',
    'majlis',
    'majlisi',
    'oliy',
    'senat',
    'senati',
    'ittifoqi',
    'agentligi',
    'kompaniyasi',
  ].map((word) => word.toLowerCase()),
)

/** O'zbekcha yozuv belgilari (`q`, `oʻ`, `gʻ`, tutuq) yoki tipik qo'shimchalar/tugallanmalar. */
const UZBEK_MARKER_RE = /[qQ]|[oOgG]ʻ|ʼ/
const UZBEK_ENDING_RE =
  /(?:iston|obod|ova|eva|yev|yeva|ov|ev|iya|lar|larni|ning|dagi|dan|ga|da|ni|si|ligi|lik|chi|siz|imiz|ingiz|gan|moqda|yapti)$/i

/**
 * Gap boshi: matn boshi yoki oldingi bo'sh bo'lmagan belgi — gap oxiri, qator, ochuvchi
 * qo'shtirnoq/qavs, tire. Ikki nuqtadan keyingi katta harfli so'z hisobga olinadi (ko'pincha nom).
 */
const SENTENCE_START_RE = /(?:^|[.!?…\n«"“„(—–•*-])\s*$/u

function isSuspiciousCandidate(token: string): boolean {
  if (!/^\p{Lu}/u.test(token)) return false
  if (UZBEK_MARKER_RE.test(token)) return false
  const lower = token.toLowerCase()
  if (UZBEK_PROPER_WORDS.has(lower)) return false
  if (!isAllUpper(token) && UZBEK_ENDING_RE.test(token)) return false
  return true
}

// ---------------------------------------------------------------------------
// Asl yozilishi qavs ichida: «Sem Altman (Sam Altman)»
// ---------------------------------------------------------------------------

const PAREN_RE = /\(([^()\n]{2,80})\)/g
const NAME_WORD = "[A-ZÀ-Þ][\\p{L}ʻʼ'’.-]*"
const PAREN_NAME_RE = new RegExp(`^${NAME_WORD}(?: ${NAME_WORD}){0,3}$`, 'u')
const PRECEDING_NAMES_RE = new RegExp(
  `((?:${NAME_WORD}[ \\u00A0]+){0,3}${NAME_WORD})[ \\u00A0]*$`,
  'u',
)

/** Bosh harflar talaffuzda mos keladimi (`Sem/Sam`, `Xuang/Huang`, `Ilon/Elon`, `Jorj/George`). */
const SOUND_GROUPS = ['aeiouy', 'xh', 'kcq', 'sczt', 'jgd', 'fp', 'vw']
function similarInitial(a: string, b: string): boolean {
  const x = a[0]?.toLowerCase()
  const y = b[0]?.toLowerCase()
  if (!x || !y) return false
  if (x === y) return true
  return SOUND_GROUPS.some((group) => group.includes(x) && group.includes(y))
}

interface OriginalNames {
  /** Qavs ichidagi asl yozilish (o'zgarmaydi). */
  ranges: Range[]
  /** Qavsdan oldingi o'zbekcha yozilgan ism (shubhali ro'yxatga kiritilmaydi). */
  intentional: Range[]
}

/**
 * Qavs ichidagi asl yozilish (style.md §7): `Sem Altman (Sam Altman)` — qavs ichidagi 1–4 ta katta
 * harfli lotin so'z, undan oldin xuddi shuncha katta harfli so'z va oxirgi so'zlarning bosh harfi
 * talaffuzda mos (`Altman/Altman`, `Mask/Musk`). Yoki qavs ichida lotinda qoladigan so'z bor
 * (`(Paul MacPherson)`) — butun qavs ichi lotinda qoladi.
 */
function findOriginalNames(text: string, isAnchor: (word: string) => boolean): OriginalNames {
  const ranges: Range[] = []
  const intentional: Range[] = []
  for (const match of text.matchAll(PAREN_RE)) {
    const inner = match[1]!
    if (!PAREN_NAME_RE.test(inner)) continue
    const innerWords = inner.split(' ')
    const start = match.index + 1
    const before = text.slice(0, match.index)
    const preceding = PRECEDING_NAMES_RE.exec(before)
    const looksUzbek = innerWords.some(
      (word) => UZBEK_MARKER_RE.test(word) || UZBEK_PROPER_WORDS.has(word.toLowerCase()),
    )
    let matched = false
    if (preceding && !looksUzbek) {
      const words = [...preceding[1]!.matchAll(/\S+/g)]
      const tail = words.slice(-innerWords.length)
      if (
        tail.length === innerWords.length &&
        similarInitial(tail.at(-1)![0], innerWords.at(-1)!) &&
        tail.map((word) => word[0]).join(' ') !== inner
      ) {
        matched = true
        intentional.push([preceding.index + tail[0]!.index, preceding.index + preceding[1]!.length])
      }
    }
    if (!matched) matched = innerWords.some((word) => isAnchor(normalizeApostrophes(word)))
    if (matched) ranges.push([start, start + inner.length])
  }
  return { ranges, intentional }
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
  /**
   * O'girilmaydigan atamalar: glossariy `doNotTransliterate`, postning teglari va `keepLatin`
   * ro'yxati (katta-kichik harf farqlanadi, butun so'z sifatida).
   */
  protectedTerms?: readonly string[]
  /** `#hashtag` o'zgarishsiz qoladi (default: true). */
  preserveHashtags?: boolean
}

export interface Transliterator {
  /**
   * Oddiy matnni lotindan kirillga o'giradi. `suspicious` berilsa — shubhali so'zlar (katta harf
   * bilan boshlangan, istisno/glossariyda yo'q, odatdagi qoidalar bilan o'girilgan lotin so'zlar:
   * ehtimol brend yoki chet nom) shu to'plamga yig'iladi.
   */
  toCyrillic(text: string, suspicious?: Set<string>): string
  /** Bitta so'zni (himoyalangan bo'laklarsiz) o'giradi. */
  word(word: string): string
  /** Qo'shimcha himoyalangan atamalar bilan yangi transliterator (masalan, post teglari). */
  withProtectedTerms(terms: readonly string[]): Transliterator
}

const WORD_RE = /[A-Za-zÀ-ɏ](?:[A-Za-zÀ-ɏʻ]|ʼ(?=[A-Za-z])|-(?=[A-Za-z]))*/g

type DecisionKind = 'keep' | 'exception' | 'core'

interface Decision {
  kind: DecisionKind
  out: string
}

/** Matndagi bo'lak: so'z (oddiy matnda) yoki himoyalangan bo'lak. */
interface Unit {
  start: number
  end: number
  /** So'z (normallashtirilgan apostroflar bilan); himoyalangan bo'lakda — asl matn. */
  token: string
  protected: boolean
  /** Lotinda qoladi (glossariy atamasi, chet so'z, qisqartma). */
  anchor: boolean
  decision?: Decision
  before?: string
  after?: string
}

interface Segment {
  start: number
  normalized: string
}

const RUN_GAP_RE = /^[ \u00A0]$/

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

  /** Qisqartma qoidasi (`GTA`, `ESLning`); o'zbekcha qisqartma (`whole_word` istisno) — yo'q. */
  function abbreviation(word: string): Decision | undefined {
    if (ABBREVIATION_RE.test(word)) {
      return wholeWords.has(word.toLowerCase()) ? undefined : { kind: 'keep', out: word }
    }
    const match = ABBREVIATION_SUFFIX_RE.exec(word)
    if (!match) return undefined
    const head = match[1]!
    const suffix = match[2]!
    if (!isSuffixChain(suffix) || wholeWords.has(head.toLowerCase())) return undefined
    return { kind: 'keep', out: head + transliterateContinuation(suffix, head) }
  }

  function decide(
    input: string,
    before: string | undefined,
    after: string | undefined,
    shouting: boolean,
  ): Decision {
    const normalized = normalizeApostrophes(input)
    // Butun so'z istisnosi chet so'z belgilaridan ustun (`YaIM` — ichki katta harf, lekin o'zbekcha).
    const whole = wholeWords.get(normalized.toLowerCase())
    if (whole !== undefined) return { kind: 'exception', out: applyCase(normalized, whole) }
    if (shouldKeepLatin(normalized, before, after)) return { kind: 'keep', out: input }
    if (!shouting) {
      const abbr = abbreviation(normalized)
      if (abbr) return abbr
    }
    const fromTable = fromExceptions(normalized)
    if (fromTable !== undefined) return { kind: 'exception', out: fromTable }
    if (normalized.includes('-')) {
      const parts = normalized
        .split('-')
        .map((part) => (part ? decide(part, undefined, undefined, shouting) : undefined))
      const kinds = new Set(parts.map((part) => part?.kind))
      return {
        kind: kinds.has('core') ? 'core' : kinds.has('exception') ? 'exception' : 'keep',
        out: parts.map((part) => part?.out ?? '').join('-'),
      }
    }
    return { kind: 'core', out: transliterateWordCore(normalized) }
  }

  /** So'z o'zi lotinda qoladimi (qavs ichidagi asl yozilish uchun)? */
  const isAnchorWord = (word: string): boolean => {
    const decision = decide(word, undefined, undefined, false)
    return decision.kind === 'keep' && decision.out === word
  }

  /**
   * Katta harfli lotin nomlar ketma-ketligi (`Space Launch Complex 40`, `Windows Media Player
   * Legacy`): birinchi va oxirgi lotinda qoladigan bo'lak orasidagi so'zlar ham lotinda qoladi,
   * ketma-ketlik boshidagi `The` artikli ham (`The Sanctuary`). Ketma-ketlik — bitta bo'shliq bilan
   * ajratilgan, katta harf bilan boshlangan so'zlar/atamalar (orada `of`, `and`, `the` mumkin).
   * Bitta lotin so'zga qo'shni o'zbekcha nom (`Microsoft Toshkent ofisi`) o'giriladi.
   */
  function applyNameRuns(units: Unit[], text: string): void {
    const capitalized = (unit: Unit) => /^\p{Lu}/u.test(unit.token)
    const connector = (unit: Unit) => !unit.protected && NAME_CONNECTORS.has(unit.token)
    const force = (unit: Unit) => {
      if (unit.protected || unit.decision?.kind === 'keep') return
      unit.decision = { kind: 'keep', out: unit.token }
      unit.anchor = true
    }
    let run: Unit[] = []
    const flush = () => {
      while (run.length && connector(run.at(-1)!)) run.pop()
      const anchors = run.flatMap((unit, index) => (unit.anchor ? [index] : []))
      if (anchors.length > 0) {
        const first = anchors[0]!
        const last = anchors.at(-1)!
        for (let i = first + 1; i < last; i++) force(run[i]!)
        for (let i = first - 1; i >= 0 && LEADING_ARTICLES.has(run[i]!.token); i--) force(run[i]!)
      }
      run = []
    }
    for (const unit of units) {
      const previous = run.at(-1)
      const joined = previous !== undefined && RUN_GAP_RE.test(text.slice(previous.end, unit.start))
      if (!joined) flush()
      if (capitalized(unit) || (run.length > 0 && connector(unit))) run.push(unit)
      else flush()
    }
    flush()
  }

  function toCyrillic(text: string, suspicious?: Set<string>): string {
    if (!text) return text
    const ranges: Range[] = []
    addRanges(ranges, regexRanges(text, INLINE_CODE_RE))
    addRanges(ranges, regexRanges(text, URL_RE, true))
    addRanges(ranges, regexRanges(text, EMAIL_RE))
    addRanges(ranges, regexRanges(text, DOMAIN_RE, true))
    addRanges(ranges, regexRanges(text, MENTION_RE))
    if (preserveHashtags) addRanges(ranges, regexRanges(text, HASHTAG_RE))
    const termRanges = findTermRanges(text, termIndex)
    const originals = findOriginalNames(text, isAnchorWord)
    addRanges(ranges, originals.ranges)
    addRanges(ranges, termRanges)
    ranges.sort((a, b) => a[0] - b[0])
    const anchorStarts = new Set([...termRanges, ...originals.ranges].map(([start]) => start))

    // Bo'laklar tartib bilan: oddiy matndagi so'zlar va himoyalangan bo'laklar.
    const units: Unit[] = []
    const segments: Segment[] = []
    const collectWords = (start: number, end: number) => {
      const normalized = normalizeApostrophes(text.slice(start, end))
      segments.push({ start, normalized })
      for (const match of normalized.matchAll(WORD_RE)) {
        units.push({
          start: start + match.index,
          end: start + match.index + match[0].length,
          token: match[0],
          protected: false,
          anchor: false,
          before: normalized[match.index - 1],
          after: normalized[match.index + match[0].length],
        })
      }
    }
    let cursor = 0
    for (const [start, end] of ranges) {
      collectWords(cursor, start)
      units.push({
        start,
        end,
        token: text.slice(start, end),
        protected: true,
        anchor: anchorStarts.has(start),
      })
      cursor = end
    }
    collectWords(cursor, text.length)

    const words = units.filter((unit) => !unit.protected)
    const shouting = isShoutingText(
      words.map((unit) => unit.token),
      segments.map((segment) => segment.normalized).join(' '),
    )
    for (const unit of words) {
      unit.decision = decide(unit.token, unit.before, unit.after, shouting)
      unit.anchor = unit.decision.kind === 'keep'
    }
    applyNameRuns(units, text)

    if (suspicious && !shouting) {
      for (const unit of words) {
        if (unit.decision?.kind !== 'core' || !isSuspiciousCandidate(unit.token)) continue
        if (SENTENCE_START_RE.test(text.slice(0, unit.start))) continue
        if (originals.intentional.some(([s, e]) => unit.start >= s && unit.end <= e)) continue
        suspicious.add(unit.token)
      }
    }

    // Natija: oddiy matn — normallashtirilgan apostroflar bilan, himoyalangan bo'laklar — asl.
    const byStart = new Map(words.map((unit) => [unit.start, unit]))
    let out = ''
    const emitPlain = (segment: Segment) => {
      let local = 0
      for (const match of segment.normalized.matchAll(WORD_RE)) {
        const unit = byStart.get(segment.start + match.index)
        out += segment.normalized.slice(local, match.index) + (unit?.decision?.out ?? match[0])
        local = match.index + match[0].length
      }
      out += segment.normalized.slice(local)
    }
    ranges.forEach(([start, end], index) => {
      emitPlain(segments[index]!)
      out += text.slice(start, end)
    })
    emitPlain(segments[ranges.length]!)
    return out
  }

  const self: Transliterator = {
    toCyrillic,
    word: (w) => decide(w, undefined, undefined, false).out,
    withProtectedTerms: (terms) => {
      const extra = terms.map((term) => term.trim()).filter(Boolean)
      if (extra.length === 0) return self
      return createTransliterator({
        ...options,
        protectedTerms: [...(options.protectedTerms ?? []), ...extra],
      })
    },
  }
  return self
}
