/**
 * Glossariy va transliteratsiya istisnolari seed fayllari uchun Zod sxemalari
 * (TZ §3.6, §10.8, §10.9). Xuddi shu sxemalar M1-03 seed va MCP `get_glossary`
 * uchun ham ishlatiladi.
 */
import { z } from 'zod'

const SEMVER_RE = /^\d+\.\d+\.\d+$/
const CYRILLIC_RE = /[\u0400-\u04FF]/
/** `oʻ`/`gʻ` va tutuq belgisi uchun notoʻgʻri apostrof variantlari (ASCII `'`, `‘`, `’`, backtick). */
const WRONG_APOSTROPHE_RE = /['\u2018\u2019`]/
const LATIN_WORD_RE = /^[A-Za-z][A-Za-z\u02BB\u02BC-]*$/
const CYRILLIC_WORD_RE = /^[\u0400-\u04FF][\u0400-\u04FF-]*$/
const TRIMMED_RE = /^\S(?:.*\S)?$/s

const nonEmpty = z.string().regex(TRIMMED_RE, 'Boʻsh yoki boshida/oxirida boʻshliq bor')

/** Notoʻgʻri apostroflarsiz matn (izohlarda kirill misollar boʻlishi mumkin). */
const uzText = nonEmpty.refine(
  (s) => !WRONG_APOSTROPHE_RE.test(s),
  'oʻ/gʻ uchun ʻ (U+02BB), tutuq belgisi uchun ʼ (U+02BC) ishlatilsin',
)

/** Oʻzbek lotin matni: kirill harflari va notoʻgʻri apostroflarsiz. */
const uzLatinText = uzText.refine(
  (s) => !CYRILLIC_RE.test(s),
  'Lotin matnida kirill harflari boʻlmasligi kerak',
)

export const seedMetaShape = {
  /** Semver, masalan `1.0.0` */
  version: z.string().regex(SEMVER_RE, 'Versiya semver formatida boʻlishi kerak (1.0.0)'),
  /** ISO sana, masalan `2026-09-23` */
  updatedAt: z.iso.date(),
  description: nonEmpty.optional(),
}

// ---------------------------------------------------------------------------
// Glossariy (§10.8)
// ---------------------------------------------------------------------------

export const GLOSSARY_LANGUAGES = ['en', 'ru'] as const
export const GLOSSARY_KINDS = ['term', 'brand', 'abbreviation'] as const

export const glossaryItemSchema = z
  .object({
    /** Asl atama (EN yoki RU) */
    term: nonEmpty,
    language: z.enum(GLOSSARY_LANGUAGES),
    /** Oʻzbekcha (lotin) tarjima; brend va qisqartmalarda — atamaning oʻzi */
    translation: uzLatinText,
    /** `brand` — kompaniya/mahsulot/oʻyin nomi; `abbreviation` — qisqartma; `term` — oddiy atama */
    kind: z.enum(GLOSSARY_KINDS),
    /** Tarjima qilinmaydi (matnda asl yozilishida qoladi) */
    doNotTranslate: z.boolean(),
    /** Kirill versiyasida ham lotin yozuvida qoladi */
    doNotTransliterate: z.boolean(),
    note: uzLatinText.optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.kind === 'brand' && !(item.doNotTranslate && item.doNotTransliterate)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Brend tarjima ham, transliteratsiya ham qilinmasligi kerak',
        path: ['kind'],
      })
    }
    if (item.doNotTranslate && item.translation !== item.term) {
      ctx.addIssue({
        code: 'custom',
        message: 'doNotTranslate = true boʻlsa, translation atamaning oʻzi boʻlishi kerak',
        path: ['translation'],
      })
    }
  })

export type GlossaryItem = z.infer<typeof glossaryItemSchema>

/** Glossariy kaliti: atama (katta-kichik harf farqlanmaydi). */
export const glossaryKey = (item: Pick<GlossaryItem, 'term'>): string =>
  item.term.toLocaleLowerCase('en')

export const glossarySeedSchema = z
  .object({ ...seedMetaShape, items: z.array(glossaryItemSchema).min(1) })
  .strict()
  .superRefine((seed, ctx) => addDuplicateIssues(seed.items, glossaryKey, 'term', ctx))

export type GlossarySeed = z.infer<typeof glossarySeedSchema>

// ---------------------------------------------------------------------------
// Transliteratsiya istisnolari (§10.9)
// ---------------------------------------------------------------------------

export const TRANSLIT_MATCH_TYPES = ['whole_word', 'prefix'] as const

export const translitExceptionSchema = z
  .object({
    /** Lotin soʻz yoki oʻzak */
    latin: z.string().regex(LATIN_WORD_RE, 'Faqat lotin harflari, ʻ, ʼ va chiziqcha'),
    /** Kirill shakli */
    cyrillic: z.string().regex(CYRILLIC_WORD_RE, 'Faqat kirill harflari va chiziqcha'),
    /** `whole_word` — faqat butun soʻz; `prefix` — soʻz boshlanishi (qoʻshimchali shakllar uchun) */
    matchType: z.enum(TRANSLIT_MATCH_TYPES),
    note: uzText.optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    const latinUpper = item.latin[0] === item.latin[0]?.toUpperCase()
    const cyrillicUpper = item.cyrillic[0] === item.cyrillic[0]?.toUpperCase()
    if (latinUpper !== cyrillicUpper) {
      ctx.addIssue({
        code: 'custom',
        message: 'Lotin va kirill shaklining bosh harfi mos kelishi kerak',
        path: ['cyrillic'],
      })
    }
  })

export type TranslitException = z.infer<typeof translitExceptionSchema>

/** Istisno kaliti: lotin shakli (katta-kichik harf farqlanmaydi). */
export const translitKey = (item: Pick<TranslitException, 'latin'>): string =>
  item.latin.toLocaleLowerCase('en')

export const translitExceptionsSeedSchema = z
  .object({ ...seedMetaShape, items: z.array(translitExceptionSchema).min(1) })
  .strict()
  .superRefine((seed, ctx) => addDuplicateIssues(seed.items, translitKey, 'latin', ctx))

export type TranslitExceptionsSeed = z.infer<typeof translitExceptionsSeedSchema>

// ---------------------------------------------------------------------------
// Markdown front-matter
// ---------------------------------------------------------------------------

export const docFrontMatterSchema = z
  .object({
    id: nonEmpty,
    title: uzLatinText,
    /** Faqat huquqiy sahifalarda: `pages` kolleksiyasidagi slug */
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    version: seedMetaShape.version,
    updatedAt: seedMetaShape.updatedAt,
  })
  .strict()

export type DocFrontMatter = z.infer<typeof docFrontMatterSchema>

// ---------------------------------------------------------------------------

/** Takrorlangan kalitlarni topadi (birinchi uchragan indeks bilan). */
export function findDuplicateKeys<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): { key: string; indexes: number[] }[] {
  const seen = new Map<string, number[]>()
  items.forEach((item, index) => {
    const key = keyOf(item)
    seen.set(key, [...(seen.get(key) ?? []), index])
  })
  return [...seen.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([key, indexes]) => ({ key, indexes }))
}

function addDuplicateIssues<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  field: string,
  ctx: z.RefinementCtx,
): void {
  for (const { key, indexes } of findDuplicateKeys(items, keyOf)) {
    ctx.addIssue({
      code: 'custom',
      message: `Takroriy yozuv: "${key}" (indekslar: ${indexes.join(', ')})`,
      path: ['items', indexes[1] ?? 0, field],
    })
  }
}
