/**
 * Boshlang'ich (seed) istisnolar va glossariy asosidagi transliterator (M0-05,
 * `@blog-odya/guidelines`). DB yozuvlari (`translit-exceptions`, `glossary` kolleksiyalari) ular
 * ustidan qo'shiladi — `createSeededTransliterator({ exceptions, glossary })`.
 *
 * JSON fayllar to'g'ridan-to'g'ri import qilinadi (Zod'siz): seed'larning to'g'riligini
 * `@blog-odya/guidelines` testlari kafolatlaydi, bu yerda esa `node:fs` talab qilinmaydi.
 */
import glossaryJson from '@blog-odya/guidelines/glossary.seed.json' with { type: 'json' }
import exceptionsJson from '@blog-odya/guidelines/translit-exceptions.seed.json' with { type: 'json' }

import {
  createTransliterator,
  mergeTranslitExceptions,
  protectedTermsFromGlossary,
  type GlossaryTermInput,
  type TranslitExceptionInput,
  type Transliterator,
  type TransliteratorOptions,
} from './translit'

export const SEED_TRANSLIT_EXCEPTIONS: readonly TranslitExceptionInput[] = (
  exceptionsJson.items as TranslitExceptionInput[]
).map(({ latin, cyrillic, matchType }) => ({ latin, cyrillic, matchType }))

export const SEED_GLOSSARY_TERMS: readonly GlossaryTermInput[] = (
  glossaryJson.items as GlossaryTermInput[]
).map(({ term, language, doNotTransliterate }) => ({ term, language, doNotTransliterate }))

export interface SeededTransliteratorOptions extends Omit<
  TransliteratorOptions,
  'exceptions' | 'protectedTerms'
> {
  /** DB'dagi istisnolar — seed'dan ustun. */
  exceptions?: readonly TranslitExceptionInput[]
  /** DB'dagi glossariy — seed'dan ustun. */
  glossary?: readonly GlossaryTermInput[]
}

export function createSeededTransliterator(
  options: SeededTransliteratorOptions = {},
): Transliterator {
  const { exceptions, glossary, ...rest } = options
  return createTransliterator({
    ...rest,
    exceptions: mergeTranslitExceptions(SEED_TRANSLIT_EXCEPTIONS, exceptions),
    protectedTerms: protectedTermsFromGlossary(SEED_GLOSSARY_TERMS, glossary),
  })
}

let defaultInstance: Transliterator | undefined

/** Faqat seed'lar asosidagi transliterator (DB'siz: testlar, MCP `preview_cyrillic` zaxirasi). */
export function getDefaultTransliterator(): Transliterator {
  defaultInstance ??= createSeededTransliterator()
  return defaultInstance
}

/** Qisqa yo'l: seed'lar asosida matnni kirillga o'girish. */
export const toCyrillic = (text: string): string => getDefaultTransliterator().toCyrillic(text)
