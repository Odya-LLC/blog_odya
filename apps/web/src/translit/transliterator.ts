import { glossarySeed, type GlossaryItem } from '@blog-odya/guidelines'
import {
  createSeededTransliterator,
  glossaryTermKey,
  type GlossaryTermInput,
  type TranslitExceptionInput,
  type Transliterator,
} from '@blog-odya/shared'
import type { Payload } from 'payload'

/**
 * Server tomonidagi lug'atlar: seed (`@blog-odya/guidelines`) + DB'dagi `translit-exceptions` va
 * `glossary` yozuvlari (DB ustun). Natija jarayon ichida keshlanadi (TTL 60 s) va lug'at
 * kolleksiyalari o'zgarganda tozalanadi (`invalidateTransliteratorCache`). Serverless'da har bir
 * instansiya o'z keshiga ega — boshqa instansiyalar TTL tugagach yangilanadi.
 *
 * Bir xil kesh ikki iste'molchiga xizmat qiladi: kirill sinxronlash (`getTransliterator`) va MCP
 * `get_glossary` / `odya://glossary` (`getGlossary`).
 */
export const TRANSLIT_CACHE_TTL_MS = 60_000

/** DB o'qib bo'lmasa (masalan, jadval hali yo'q) — seed bilan qisqa muddat ishlaymiz. */
const FALLBACK_TTL_MS = 5_000

/** MCP va admin uchun glossariy ko'rinishi: seed + DB (DB ustun, kalit — atama + til). */
export interface GlossarySnapshot {
  version: string
  updatedAt: string
  /** `seed` — DB bo'sh yoki o'qilmadi; `seed+db` — seed ustidan DB yozuvlari. */
  source: 'seed' | 'seed+db'
  items: GlossaryItem[]
}

interface Dictionaries {
  transliterator: Transliterator
  glossary: GlossarySnapshot
}

let cache: { expiresAt: number; value: Dictionaries } | undefined
let loading: Promise<Dictionaries> | undefined

export function invalidateTransliteratorCache(): void {
  cache = undefined
  loading = undefined
}

/** Faqat seed asosidagi glossariy (DB'siz: testlar, zaxira). */
export function seedGlossary(): GlossarySnapshot {
  return {
    version: glossarySeed.version,
    updatedAt: glossarySeed.updatedAt,
    source: 'seed',
    items: [...glossarySeed.items],
  }
}

type GlossaryDoc = {
  term: string
  language: GlossaryItem['language']
  translation: string
  kind: GlossaryItem['kind']
  doNotTranslate?: boolean | null
  doNotTransliterate?: boolean | null
  note?: string | null
  updatedAt?: string
}

/** Seed ustiga DB yozuvlarini qo'yadi (kalit — atama + til, katta-kichik harf farqlanmaydi). */
export function mergeGlossary(docs: readonly GlossaryDoc[]): GlossarySnapshot {
  const base = seedGlossary()
  if (docs.length === 0) return base
  const byKey = new Map<string, GlossaryItem>()
  for (const item of base.items) byKey.set(glossaryTermKey(item), item)
  let updatedAt = base.updatedAt
  for (const doc of docs) {
    const item: GlossaryItem = {
      term: doc.term,
      language: doc.language,
      translation: doc.translation,
      kind: doc.kind,
      doNotTranslate: Boolean(doc.doNotTranslate),
      doNotTransliterate: Boolean(doc.doNotTransliterate),
      ...(doc.note ? { note: doc.note } : {}),
    }
    byKey.set(glossaryTermKey(item), item)
    const day = doc.updatedAt?.slice(0, 10)
    if (day && day > updatedAt) updatedAt = day
  }
  const items = [...byKey.values()].sort((a, b) =>
    a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }),
  )
  return { version: base.version, updatedAt, source: 'seed+db', items }
}

async function loadFromDatabase(payload: Payload): Promise<Dictionaries> {
  // `req` berilmaydi: o'qish joriy tranzaksiyadan tashqarida (xato bo'lsa saqlash tranzaksiyasi
  // buzilmaydi; kesh boshqa so'rovlar bilan ham bo'lishiladi).
  const exceptions = await payload.find({
    collection: 'translit-exceptions',
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { latin: true, cyrillic: true, matchType: true },
  })
  const glossary = await payload.find({
    collection: 'glossary',
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: {
      term: true,
      language: true,
      translation: true,
      kind: true,
      doNotTranslate: true,
      doNotTransliterate: true,
      note: true,
      updatedAt: true,
    },
  })
  const transliterator = createSeededTransliterator({
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
  return { transliterator, glossary: mergeGlossary(glossary.docs as GlossaryDoc[]) }
}

async function getDictionaries(payload: Payload): Promise<Dictionaries> {
  if (cache && cache.expiresAt > Date.now()) return cache.value
  loading ??= (async () => {
    try {
      const value = await loadFromDatabase(payload)
      cache = { expiresAt: Date.now() + TRANSLIT_CACHE_TTL_MS, value }
      return value
    } catch (error) {
      payload.logger.warn({ err: error }, 'Transliteratsiya lugʻatlari DBdan oʻqilmadi — seed')
      const value = { transliterator: createSeededTransliterator(), glossary: seedGlossary() }
      cache = { expiresAt: Date.now() + FALLBACK_TTL_MS, value }
      return value
    } finally {
      loading = undefined
    }
  })()
  return loading
}

/** Kirill sinxronlash uchun transliterator (seed + DB lug'atlari). */
export async function getTransliterator(payload: Payload): Promise<Transliterator> {
  return (await getDictionaries(payload)).transliterator
}

/** Glossariy (seed + DB) — MCP `get_glossary`, `odya://glossary`, prompt'lar. */
export async function getGlossary(payload: Payload): Promise<GlossarySnapshot> {
  return (await getDictionaries(payload)).glossary
}
