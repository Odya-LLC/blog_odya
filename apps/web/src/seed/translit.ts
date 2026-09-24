import { exceptionKey } from '@blog-odya/shared'
import type { Payload, PayloadRequest } from 'payload'

/** Seed kaliti: atama + til (katta-kichik harf farqlanmaydi). */
const glossaryKey = (term: string, language: string) => `${term.trim().toLowerCase()}|${language}`

export interface SeedCounts {
  created: number
  skipped: number
}

export interface TranslitSeedResult {
  translitExceptions: SeedCounts
  glossary: SeedCounts
}

/**
 * `translit-exceptions` va `glossary` kolleksiyalariga boshlang'ich yozuvlarni yuklaydi
 * (`@blog-odya/guidelines` seed'lari, Zod bilan tekshirilgan).
 *
 * Idempotent: mavjud yozuvlar (kalit — lotin shakli / atama + til, katta-kichik harf
 * farqlanmaydi) qayta yaratilmaydi va **o'zgartirilmaydi** — admin'dagi tuzatishlar saqlanadi.
 * OBLOG-9 umumiy `pnpm seed` skriptidan shu funksiyani chaqiradi.
 */
export async function seedTranslitDictionaries(
  payload: Payload,
  options: { req?: Partial<PayloadRequest> } = {},
): Promise<TranslitSeedResult> {
  const { glossarySeed, translitExceptionsSeed } = await import('@blog-odya/guidelines')
  const req = options.req

  const existingExceptions = await payload.find({
    collection: 'translit-exceptions',
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
    select: { latin: true },
  })
  const exceptionKeys = new Set(existingExceptions.docs.map((doc) => exceptionKey(doc.latin)))
  const translitExceptions: SeedCounts = { created: 0, skipped: 0 }
  for (const item of translitExceptionsSeed.items) {
    const key = exceptionKey(item.latin)
    if (exceptionKeys.has(key)) {
      translitExceptions.skipped++
      continue
    }
    await payload.create({
      collection: 'translit-exceptions',
      data: {
        latin: item.latin,
        cyrillic: item.cyrillic,
        matchType: item.matchType,
        note: item.note,
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
    exceptionKeys.add(key)
    translitExceptions.created++
  }

  const existingGlossary = await payload.find({
    collection: 'glossary',
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
    select: { term: true, language: true },
  })
  const glossaryKeys = new Set(
    existingGlossary.docs.map((doc) => glossaryKey(doc.term, doc.language)),
  )
  const glossary: SeedCounts = { created: 0, skipped: 0 }
  for (const item of glossarySeed.items) {
    const key = glossaryKey(item.term, item.language)
    if (glossaryKeys.has(key)) {
      glossary.skipped++
      continue
    }
    await payload.create({
      collection: 'glossary',
      data: {
        term: item.term,
        language: item.language,
        translation: item.translation,
        kind: item.kind,
        doNotTranslate: item.doNotTranslate,
        doNotTransliterate: item.doNotTransliterate,
        note: item.note,
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
    glossaryKeys.add(key)
    glossary.created++
  }

  return { translitExceptions, glossary }
}
