/**
 * Tahririyat ko'rsatmalari (stil qo'llanma, mualliflik va SEO qoidalari, chiqish sxemasi),
 * glossariy, transliteratsiya istisnolari va huquqiy sahifalar matni.
 * MCP server ularni prompt/resource sifatida beradi (TZ §5.2, §6.3); seed'lar M1-02/M1-03 da
 * kolleksiyalarga yuklanadi.
 */
import glossaryJson from '../glossary.seed.json' with { type: 'json' }
import translitJson from '../translit-exceptions.seed.json' with { type: 'json' }
import { glossarySeedSchema, translitExceptionsSeedSchema } from './schemas'

export * from './schemas'
export * from './docs'

/** Glossariy seed (Zod bilan tekshirilgan). */
export const glossarySeed = glossarySeedSchema.parse(glossaryJson)

/** Transliteratsiya istisnolari seed (Zod bilan tekshirilgan). */
export const translitExceptionsSeed = translitExceptionsSeedSchema.parse(translitJson)
