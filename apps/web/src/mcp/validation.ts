import type { MarkdownStats } from './markdown'

/**
 * Server tomonidagi tekshiruvlar (TZ §5.3, `packages/guidelines/seo.md`, `output-schema.md`):
 *
 * - **Xatolar** (`errors`, saqlanmaydi): lotin maydonlarida kirill harflari, qat'iy uzunlik
 *   chegaralari (`title` ≤ 70, `seoTitle` ≤ 60, `metaDescription` 140–160, `excerpt` ≤ 300),
 *   xavfli havolalar, bo'sh matn, `sources` bo'sh.
 * - **Ogohlantirishlar** (`warnings`, saqlanadi): SEO tavsiyalari (400–900 so'z, H2, ichki/tashqi
 *   havolalar, 3–7 teg, focus keyword joylashuvi, FAQ, alt), manba bilan yuqori n-gram o'xshashlik,
 *   noto'g'ri apostrof.
 * - `seoScore` — 0–100, ma'lumot uchun (SEO tekshiruv ro'yxati bo'yicha vaznli ball).
 *
 * Sof funksiyalar — unit testlar uchun.
 */

export interface Issue {
  field: string
  code: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  errors: Issue[]
  warnings: Issue[]
  seoScore: number
}

export const LIMITS = {
  title: 70,
  seoTitle: 60,
  metaDescription: { min: 140, max: 160 },
  excerpt: { min: 160, max: 300 },
  bodyWords: { min: 400, max: 900 },
  h2Min: 2,
  internalLinks: { min: 2, max: 5 },
  externalLinksMin: 1,
  tags: { min: 3, max: 7 },
  tagName: 50,
  faq: { min: 2, max: 4 },
  focusKeywordWords: 4,
  focusKeywordChars: 60,
  coverAltWords: { min: 5, max: 15 },
} as const

/** Belgilar soni — Unicode kod nuqtalari bo'yicha (`ʻ` — bitta belgi). */
export function charLength(text: string): number {
  return [...text].length
}

const CYRILLIC_RE = /[\u0400-\u052F]/gu

/** Matndagi kirill harflari (takrorlanmas, ko'pi bilan 5 ta) — xato matni uchun. */
export function findCyrillic(text: string): string[] {
  return [...new Set(text.match(CYRILLIC_RE) ?? [])].slice(0, 5)
}

/** `o'`/`g'` (ASCII yoki tipografik apostrof bilan) — `oʻ`/`gʻ` (U+02BB) bo'lishi kerak. */
const WRONG_OKINA_RE = /[oOgG]['‘’`](?=[a-zA-Zʻ])(?!s\b)/u

export function hasWrongOkina(text: string): boolean {
  return WRONG_OKINA_RE.test(text)
}

const APOSTROPHES_RE = /[ʻʼ'‘’`´]/gu

/** Kalit so'zni qidirish uchun normallashtirish: kichik harf, apostroflar va bo'shliqlar bir xil. */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(APOSTROPHES_RE, 'ʻ').replace(/\s+/g, ' ').trim()
}

/**
 * Matnda focus keyword bormi. O'zbek qo'shimchalari uchun oxirgi so'zning o'zagi ham qabul
 * qilinadi: "iPhone 18 taqdimoti" ↔ "iPhone 18 taqdimotini" / "taqdimotida".
 */
export function containsKeyword(text: string | null | undefined, keyword: string): boolean {
  if (!text || !keyword.trim()) return false
  const haystack = normalizeForMatch(text)
  const needle = normalizeForMatch(keyword)
  if (haystack.includes(needle)) return true
  const words = needle.split(' ')
  const last = words.pop() ?? ''
  if (last.length <= 4) return false
  const stem = last.slice(0, Math.max(4, last.length - 3))
  return haystack.includes([...words, stem].join(' '))
}

// ---------------------------------------------------------------------------
// Manba bilan n-gram o'xshashlik
// ---------------------------------------------------------------------------

export const SIMILARITY_NGRAM = 5
/** Qayta yozilgan matnning shuncha ulushi manbadagi 5-gramlardan iborat bo'lsa — ogohlantirish. */
export const SIMILARITY_WARN_CONTAINMENT = 0.25
/** Manbadan ketma-ket shuncha so'z aynan ko'chirilgan bo'lsa — ogohlantirish. */
export const SIMILARITY_WARN_RUN = 16

export function tokenize(text: string): string[] {
  return (normalizeForMatch(text).match(/[\p{L}\p{N}ʻ]+/gu) ?? []).map((token) =>
    token.replace(/ʻ/g, ''),
  )
}

function shingles(tokens: string[], n: number): string[] {
  const out: string[] = []
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(' '))
  return out
}

export interface Similarity {
  /** Matndagi n-gramlarning manbada ham uchraydigan ulushi (0–1). */
  containment: number
  /** Manba bilan eng uzun umumiy ketma-ket so'zlar soni. */
  longestRun: number
}

/**
 * Word n-gram (standart 5) o'xshashlik: EN/RU → UZ tarjimada asosan raqam va nom ketma-ketliklari
 * mos keladi (TZ §5.3), shuning uchun yuqori qiymat — deyarli ko'chirilgan matn belgisi.
 */
export function ngramSimilarity(text: string, source: string, n = SIMILARITY_NGRAM): Similarity {
  const textTokens = tokenize(text)
  const sourceSet = new Set(shingles(tokenize(source), n))
  const textShingles = shingles(textTokens, n)
  if (!textShingles.length || !sourceSet.size) return { containment: 0, longestRun: 0 }
  let shared = 0
  let run = 0
  let longest = 0
  for (const shingle of textShingles) {
    if (sourceSet.has(shingle)) {
      shared++
      run++
      longest = Math.max(longest, run)
    } else {
      run = 0
    }
  }
  return {
    containment: shared / textShingles.length,
    longestRun: longest ? longest + n - 1 : 0,
  }
}

// ---------------------------------------------------------------------------
// Maydon tekshiruvlari
// ---------------------------------------------------------------------------

class Collector {
  readonly errors: Issue[] = []
  readonly warnings: Issue[] = []

  error(field: string, code: string, message: string) {
    this.errors.push({ field, code, message })
  }

  warn(field: string, code: string, message: string) {
    this.warnings.push({ field, code, message })
  }

  /** Lotin maydoni: kirill harflari — xato; noto'g'ri `oʻ/gʻ` apostrofi — ogohlantirish. */
  latin(field: string, label: string, text: string | null | undefined) {
    if (!text) return
    const cyrillic = findCyrillic(text)
    if (cyrillic.length) {
      this.error(
        field,
        'cyrillic_in_latin',
        `${label} lotin yozuvida bo'lishi kerak — kirill harflari topildi: ${cyrillic.join(', ')}. ` +
          'Kirill versiyasi avtomatik yaratiladi.',
      )
    }
    if (hasWrongOkina(text)) {
      this.warn(
        field,
        'wrong_apostrophe',
        `${label}: oʻ/gʻ uchun ʻ (U+02BB) ishlatilsin (o' / g' emas).`,
      )
    }
  }

  maxChars(field: string, label: string, text: string, max: number) {
    const length = charLength(text)
    if (length > max) {
      this.error(field, 'too_long', `${label} ${max} belgidan oshmasligi kerak (hozir ${length}).`)
    }
  }
}

export interface RewriteInput {
  title: string
  excerpt: string
  /** Markdown konvertatsiyasi statistikasi. */
  body: MarkdownStats
  tags: string[]
}

/** `save_rewrite` maydonlari (qat'iy qoidalar). */
export function checkRewriteFields(input: RewriteInput): { errors: Issue[]; warnings: Issue[] } {
  const c = new Collector()
  const title = input.title.trim()
  const excerpt = input.excerpt.trim()

  if (!title) c.error('title', 'required', "Sarlavha bo'sh bo'lmasin.")
  c.maxChars('title', 'Sarlavha', title, LIMITS.title)
  c.latin('title', 'Sarlavha', title)
  if (/!|\?{2,}/.test(title) || (title.length > 10 && title === title.toUpperCase())) {
    c.warn('title', 'clickbait', 'Sarlavhada undov, bosh harflar va clickbait ishlatilmaydi.')
  }
  if (/[.]$/.test(title)) c.warn('title', 'trailing_period', "Sarlavha oxirida nuqta qo'yilmaydi.")

  if (!excerpt) c.error('excerpt', 'required', "Lid (excerpt) bo'sh bo'lmasin.")
  c.maxChars('excerpt', 'Lid (excerpt)', excerpt, LIMITS.excerpt.max)
  c.latin('excerpt', 'Lid (excerpt)', excerpt)

  if (input.body.words === 0) {
    c.error('body', 'required', "Matn (body) bo'sh bo'lmasin — Markdown formatida yozing.")
  }
  c.latin('body', 'Matn (body)', input.body.plainText)

  if (input.tags.length > LIMITS.tags.max) {
    c.error(
      'tags',
      'too_many',
      `Teglar ${LIMITS.tags.max} tadan oshmasligi kerak (hozir ${input.tags.length}).`,
    )
  }
  input.tags.forEach((tag, index) => {
    c.latin(`tags[${index}]`, `Teg "${tag}"`, tag)
    c.maxChars(`tags[${index}]`, `Teg "${tag}"`, tag, LIMITS.tagName)
  })
  return { errors: c.errors, warnings: c.warnings }
}

export interface SeoInput {
  seoTitle: string
  metaDescription: string
  focusKeyword: string
  faq?: { question: string; answer: string }[]
  coverAlt?: string
}

/** `set_seo` maydonlari (qat'iy qoidalar). */
export function checkSeoFields(input: SeoInput): { errors: Issue[]; warnings: Issue[] } {
  const c = new Collector()
  const seoTitle = input.seoTitle.trim()
  const description = input.metaDescription.trim()
  const keyword = input.focusKeyword.trim()

  if (!seoTitle) c.error('seoTitle', 'required', "seoTitle bo'sh bo'lmasin.")
  c.maxChars('seoTitle', 'seoTitle', seoTitle, LIMITS.seoTitle)
  c.latin('seoTitle', 'seoTitle', seoTitle)
  if (/blog odya/i.test(seoTitle)) {
    c.warn('seoTitle', 'brand_in_title', "«— Blog Odya» qo'shilmaydi — sayt o'zi qo'shadi.")
  }

  const descLength = charLength(description)
  if (descLength < LIMITS.metaDescription.min || descLength > LIMITS.metaDescription.max) {
    c.error(
      'metaDescription',
      descLength < LIMITS.metaDescription.min ? 'too_short' : 'too_long',
      `metaDescription ${LIMITS.metaDescription.min}–${LIMITS.metaDescription.max} belgi ` +
        `bo'lishi kerak (hozir ${descLength}).`,
    )
  }
  c.latin('metaDescription', 'metaDescription', description)

  if (!keyword) c.error('focusKeyword', 'required', "focusKeyword bo'sh bo'lmasin.")
  const keywordWords = keyword.split(/\s+/).filter(Boolean).length
  if (keywordWords > LIMITS.focusKeywordWords || charLength(keyword) > LIMITS.focusKeywordChars) {
    c.error(
      'focusKeyword',
      'too_long',
      `focusKeyword — 1–${LIMITS.focusKeywordWords} so'zli ibora (hozir ${keywordWords} so'z).`,
    )
  }
  c.latin('focusKeyword', 'focusKeyword', keyword)

  const faq = input.faq ?? []
  if (faq.length > LIMITS.faq.max) {
    c.error('faq', 'too_many', `FAQ ko'pi bilan ${LIMITS.faq.max} ta (hozir ${faq.length}).`)
  } else if (faq.length === 1) {
    c.warn('faq', 'too_few', `FAQ — 0 yoki ${LIMITS.faq.min}–${LIMITS.faq.max} ta savol.`)
  }
  faq.forEach((item, index) => {
    const question = item.question.trim()
    const answer = item.answer.trim()
    if (!question || !answer) {
      c.error(`faq[${index}]`, 'required', "FAQ savoli va javobi bo'sh bo'lmasin.")
    }
    c.latin(`faq[${index}].question`, `FAQ ${index + 1}-savol`, question)
    c.latin(`faq[${index}].answer`, `FAQ ${index + 1}-javob`, answer)
    if (question && !question.endsWith('?')) {
      c.warn(`faq[${index}].question`, 'no_question_mark', 'FAQ savoli "?" bilan tugaydi.')
    }
  })

  const alt = input.coverAlt?.trim()
  if (alt) {
    c.latin('coverAlt', 'coverAlt', alt)
    c.maxChars('coverAlt', 'coverAlt', alt, 200)
    const words = alt.split(/\s+/).filter(Boolean).length
    if (words < LIMITS.coverAltWords.min || words > LIMITS.coverAltWords.max) {
      c.warn(
        'coverAlt',
        'length',
        `coverAlt — ${LIMITS.coverAltWords.min}–${LIMITS.coverAltWords.max} so'z (hozir ${words}).`,
      )
    }
    if (/^(rasm|surat)\b/i.test(alt)) {
      c.warn('coverAlt', 'starts_with_image', "«Rasm», «surat» so'zlari bilan boshlanmaydi.")
    }
  }
  return { errors: c.errors, warnings: c.warnings }
}

// ---------------------------------------------------------------------------
// Post holati bo'yicha SEO tekshiruvi va ball
// ---------------------------------------------------------------------------

/** Post'ning (saqlanadigan) lotin holati — SEO ball va tavsiyalar uchun. */
export interface PostSeoState {
  title: string
  excerpt: string
  body: MarkdownStats | null
  hasCategory: boolean
  tagsCount: number
  seoTitle: string
  metaDescription: string
  focusKeyword: string
  faqCount: number
  coverAlt: string
  sourcesCount: number
}

interface SeoCheck {
  weight: number
  pass: boolean
  field: string
  code: string
  message: string
}

function seoChecks(state: PostSeoState): SeoCheck[] {
  const keyword = state.focusKeyword.trim()
  const body = state.body
  const words = body?.words ?? 0
  const h2 = body?.headings.filter((heading) => heading.depth <= 2).length ?? 0
  const internal = body ? new Set(body.internalLinks).size : 0
  const external = body?.externalLinks.length ?? 0
  const excerptLength = charLength(state.excerpt.trim())
  const kw = (text: string | null | undefined) => (keyword ? containsKeyword(text, keyword) : false)
  const keywordInBody =
    !!body && (body.headings.some((heading) => kw(heading.text)) || kw(body.firstParagraph))

  return [
    {
      weight: 5,
      pass: !!state.title && charLength(state.title) <= LIMITS.title,
      field: 'title',
      code: 'length',
      message: `Sarlavha ≤ ${LIMITS.title} belgi.`,
    },
    {
      weight: 10,
      pass: !!state.seoTitle && charLength(state.seoTitle) <= LIMITS.seoTitle,
      field: 'seoTitle',
      code: 'missing',
      message: `seoTitle (≤ ${LIMITS.seoTitle} belgi) yozilmagan — set_seo.`,
    },
    {
      weight: 10,
      pass:
        charLength(state.metaDescription) >= LIMITS.metaDescription.min &&
        charLength(state.metaDescription) <= LIMITS.metaDescription.max,
      field: 'metaDescription',
      code: 'missing',
      message: `metaDescription (${LIMITS.metaDescription.min}–${LIMITS.metaDescription.max} belgi) yozilmagan — set_seo.`,
    },
    {
      weight: 5,
      pass: excerptLength >= LIMITS.excerpt.min && excerptLength <= LIMITS.excerpt.max,
      field: 'excerpt',
      code: 'length',
      message: `Lid ${LIMITS.excerpt.min}–${LIMITS.excerpt.max} belgi bo'lsin (hozir ${excerptLength}).`,
    },
    {
      weight: 10,
      pass: words >= LIMITS.bodyWords.min && words <= LIMITS.bodyWords.max,
      field: 'body',
      code: 'word_count',
      message: `Matn ${LIMITS.bodyWords.min}–${LIMITS.bodyWords.max} so'z bo'lsin (hozir ${words}).`,
    },
    {
      weight: 5,
      pass: h2 >= LIMITS.h2Min,
      field: 'body',
      code: 'headings',
      message: `Matnda kamida ${LIMITS.h2Min} ta H2 (##) bo'lim sarlavhasi bo'lsin (hozir ${h2}).`,
    },
    {
      weight: 10,
      pass: internal >= LIMITS.internalLinks.min && internal <= LIMITS.internalLinks.max,
      field: 'body',
      code: 'internal_links',
      message:
        `Ichki havolalar ${LIMITS.internalLinks.min}–${LIMITS.internalLinks.max} ta bo'lsin ` +
        `(hozir ${internal}; search_posts bilan toping, /kategoriya/slug). Topilmasa — notesForEditor ga yozing.`,
    },
    {
      weight: 5,
      pass: external >= LIMITS.externalLinksMin,
      field: 'body',
      code: 'external_links',
      message: "Kamida 1 ta tashqi havola (manba, https://…) bo'lsin.",
    },
    {
      weight: 5,
      pass: state.hasCategory,
      field: 'category',
      code: 'missing',
      message: 'Kategoriya tanlanmagan.',
    },
    {
      weight: 5,
      pass: state.tagsCount >= LIMITS.tags.min && state.tagsCount <= LIMITS.tags.max,
      field: 'tags',
      code: 'count',
      message: `Teglar ${LIMITS.tags.min}–${LIMITS.tags.max} ta bo'lsin (hozir ${state.tagsCount}).`,
    },
    {
      weight: 5,
      pass: kw(state.title),
      field: 'title',
      code: 'keyword_missing',
      message: 'focusKeyword sarlavhada (title) uchramaydi.',
    },
    {
      weight: 5,
      pass: kw(state.seoTitle),
      field: 'seoTitle',
      code: 'keyword_missing',
      message: 'focusKeyword seoTitle da uchramaydi.',
    },
    {
      weight: 5,
      pass: kw(state.excerpt),
      field: 'excerpt',
      code: 'keyword_missing',
      message: 'focusKeyword lidda (excerpt) uchramaydi.',
    },
    {
      weight: 5,
      pass: kw(state.metaDescription),
      field: 'metaDescription',
      code: 'keyword_missing',
      message: 'focusKeyword metaDescription da uchramaydi.',
    },
    {
      weight: 5,
      pass: keywordInBody,
      field: 'body',
      code: 'keyword_missing',
      message: 'focusKeyword H2 sarlavhada yoki birinchi abzasda uchramaydi.',
    },
    {
      weight: 5,
      pass: !!state.coverAlt.trim(),
      field: 'coverAlt',
      code: 'missing',
      message: 'coverAlt (muqova rasmi alt matni taklifi) yozilmagan — set_seo.',
    },
  ]
}

/** Vaznlar yig'indisi — 100. */
export function seoScore(state: PostSeoState): number {
  const checks = seoChecks(state)
  const total = checks.reduce((sum, check) => sum + check.weight, 0)
  const passed = checks.reduce((sum, check) => sum + (check.pass ? check.weight : 0), 0)
  return Math.round((passed / total) * 100)
}

/**
 * SEO tavsiyalari (ogohlantirishlar). `scope` — faqat shu maydonlarga tegishlilari (masalan,
 * `save_rewrite` SEO maydonlari hali yo'q bo'lsa ular haqida ogohlantirmaydi).
 */
export function seoWarnings(state: PostSeoState, scope: 'rewrite' | 'seo' | 'all'): Issue[] {
  const hasSeo = !!state.focusKeyword.trim()
  return seoChecks(state)
    .filter((check) => !check.pass)
    .filter((check) => {
      if (check.code === 'keyword_missing') return hasSeo
      if (scope === 'rewrite')
        return !['seoTitle', 'metaDescription', 'coverAlt'].includes(check.field)
      return true
    })
    .map(({ field, code, message }) => ({ field, code: `seo_${code}`, message }))
}

/** Manba bilan o'xshashlik ogohlantirishi (bo'lsa). */
export function similarityWarning(similarity: Similarity): Issue | null {
  if (
    similarity.containment < SIMILARITY_WARN_CONTAINMENT &&
    similarity.longestRun < SIMILARITY_WARN_RUN
  ) {
    return null
  }
  return {
    field: 'body',
    code: 'source_similarity',
    message:
      `Matn manbaga juda o'xshash (5-gram mosligi ${Math.round(similarity.containment * 100)}%, ` +
      `eng uzun ko'chirilgan bo'lak ${similarity.longestRun} so'z). So'zma-so'z tarjima/ko'chirish ` +
      "emas — gap tuzilishini o'zgartirib, o'z so'zlaringiz bilan qayta yozing.",
  }
}

export function sourcesError(sourcesCount: number): Issue | null {
  return sourcesCount > 0
    ? null
    : {
        field: 'sources',
        code: 'sources_empty',
        message:
          "Atributsiya (sources) bo'sh — post yig'ilgan elementdan (create_draft) yaratilishi " +
          "yoki muharrir manbani qo'shishi kerak.",
      }
}
