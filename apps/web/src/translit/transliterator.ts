import {
  createSeededTransliterator,
  type GlossaryTermInput,
  type TranslitExceptionInput,
  type Transliterator,
} from '@blog-odya/shared'
import type { PayloadRequest } from 'payload'

/**
 * Server tomonidagi transliterator: seed (`@blog-odya/guidelines`) + DB'dagi `translit-exceptions`
 * va `glossary` yozuvlari (DB ustun). Natija jarayon ichida keshlanadi (TTL) va lug'at
 * kolleksiyalari o'zgarganda tozalanadi (`invalidateTransliteratorCache`). Serverless'da har bir
 * instansiya o'z keshiga ega — boshqa instansiyalar TTL tugagach yangilanadi.
 */
export const TRANSLIT_CACHE_TTL_MS = 60_000

/** DB o'qib bo'lmasa (masalan, jadval hali yo'q) — seed bilan qisqa muddat ishlaymiz. */
const FALLBACK_TTL_MS = 5_000

let cache: { expiresAt: number; transliterator: Transliterator } | undefined
let loading: Promise<Transliterator> | undefined

export function invalidateTransliteratorCache(): void {
  cache = undefined
  loading = undefined
}

async function loadFromDatabase(req: PayloadRequest): Promise<Transliterator> {
  // `req` berilmaydi: o'qish joriy tranzaksiyadan tashqarida (xato bo'lsa saqlash tranzaksiyasi
  // buzilmaydi; kesh boshqa so'rovlar bilan ham bo'lishiladi).
  const exceptions = await req.payload.find({
    collection: 'translit-exceptions',
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { latin: true, cyrillic: true, matchType: true },
  })
  const glossary = await req.payload.find({
    collection: 'glossary',
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { term: true, language: true, doNotTransliterate: true },
  })
  return createSeededTransliterator({
    exceptions: exceptions.docs.map((doc): TranslitExceptionInput => ({
      latin: doc.latin,
      cyrillic: doc.cyrillic,
      matchType: doc.matchType,
    })),
    glossary: glossary.docs.map((doc): GlossaryTermInput => ({
      term: doc.term,
      language: doc.language,
      doNotTransliterate: doc.doNotTransliterate,
    })),
  })
}

export async function getTransliterator(req: PayloadRequest): Promise<Transliterator> {
  if (cache && cache.expiresAt > Date.now()) return cache.transliterator
  loading ??= (async () => {
    try {
      const transliterator = await loadFromDatabase(req)
      cache = { expiresAt: Date.now() + TRANSLIT_CACHE_TTL_MS, transliterator }
      return transliterator
    } catch (error) {
      req.payload.logger.warn({ err: error }, 'Transliteratsiya lugʻatlari DBdan oʻqilmadi — seed')
      const transliterator = createSeededTransliterator()
      cache = { expiresAt: Date.now() + FALLBACK_TTL_MS, transliterator }
      return transliterator
    } finally {
      loading = undefined
    }
  })()
  return loading
}
