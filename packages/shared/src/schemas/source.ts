import { z } from 'zod'
import { slugSchema } from './category'

/**
 * `sources` kolleksiyasi seed sxemasi — TZ §10.1.
 * Relationship maydonlari (`feeds[].mapsTo`, `keywordRules[].category`) seed'da
 * kategoriya **slug**'i bilan beriladi; seed skripti (M1-02 / M2-01) ularni ID'ga aylantiradi.
 * `id`, `createdAt`, `updatedAt`, `stats` — Payload/runtime tomonidan to'ldiriladi.
 */

export const FETCH_MODES = ['rss_only', 'rss_plus_page'] as const
export const SOURCE_LANGUAGES = ['en', 'ru'] as const

const httpsUrl = z.url({ protocol: /^https$/ })

export const feedSchema = z
  .object({
    url: httpsUrl,
    /** Manba tomonidagi bo'lim/kategoriya nomi (ma'lumot uchun, klassifikatsiyada log'ga yoziladi). */
    feedCategory: z.string().trim().min(1),
    /** Bizning kategoriya slug'i (rel → categories). */
    mapsTo: slugSchema,
    /**
     * `item.classify` da mapping bali (default 10 — bo'lim feedi). Umumiy feedlar ("All",
     * "Новости") — 1: kategoriyani kalit so'zlar hal qiladi, mapping faqat zaxira.
     */
    mappingWeight: z.number().int().min(0).max(20).optional(),
    isActive: z.boolean(),
  })
  .strict()

/** `item.fetch` / `item.extract` uchun maxsus CSS selektorlar (§3.5). Faqat `rss_plus_page` da ishlatiladi. */
export const selectorsSchema = z
  .object({
    /** Maqola matni konteyneri. */
    content: z.string().min(1),
    title: z.string().min(1).optional(),
    author: z.string().min(1).optional(),
    publishedAt: z.string().min(1).optional(),
    /** Konteyner ichidan olib tashlanadigan elementlar (reklama, "shuningdek o'qing" va h.k.). */
    remove: z.array(z.string().min(1)).optional(),
  })
  .strict()

export const keywordRuleSchema = z
  .object({
    /**
     * Kichik harflarda; sarlavha + excerpt + sourceTags bo'yicha butun so'z/ibora mosligi.
     * So'z oxiridagi `*` — prefiks (o'zak) mosligi: "нейросет*" → нейросеть, нейросети...
     */
    keyword: z
      .string()
      .trim()
      .min(2)
      .regex(
        /^[\p{L}\p{N}.+#-]+\*?(?: [\p{L}\p{N}.+#-]+\*?)*$/u,
        'keyword formati: so‘zlar, ixtiyoriy oxirgi "*"',
      )
      .refine((s) => s === s.toLowerCase(), 'keyword kichik harflarda bo‘lishi kerak'),
    /** Bizning kategoriya slug'i (rel → categories). */
    category: slugSchema,
    /** Kategoriya balliga qo'shiladi; feed mapping'i asosiy ball (10) beradi. */
    boost: z.number().int().min(-10).max(10),
  })
  .strict()

export const sourceSchema = z
  .object({
    name: z.string().trim().min(1),
    slug: slugSchema,
    homepageUrl: httpsUrl,
    feeds: z.array(feedSchema).min(1),
    language: z.enum(SOURCE_LANGUAGES),
    fetchMode: z.enum(FETCH_MODES),
    selectors: selectorsSchema.nullable().default(null),
    pollIntervalMin: z.number().int().min(10).max(1440).default(15),
    /** TZ §2.3: 1 so'rov / 5–10 s / domen — pastki chegara 5 s. */
    rateLimitSec: z.number().int().min(5).max(600).default(10),
    robotsCheckedAt: z.iso.date(),
    tosNotes: z.string().trim().min(20),
    priority: z.number().int().min(0).max(50),
    keywordRules: z.array(keywordRuleSchema),
    isActive: z.boolean(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.fetchMode === 'rss_plus_page' && s.selectors === null)
      ctx.addIssue({
        code: 'custom',
        path: ['selectors'],
        message: 'rss_plus_page uchun selectors.content kerak',
      })
    const host = new URL(s.homepageUrl).hostname.replace(/^www\./, '')
    s.feeds.forEach((f, i) => {
      const fh = new URL(f.url).hostname.replace(/^www\./, '')
      if (fh !== host)
        ctx.addIssue({
          code: 'custom',
          path: ['feeds', i, 'url'],
          message: `feed domeni (${fh}) manba domeniga (${host}) mos emas`,
        })
    })
    const urls = s.feeds.map((f) => f.url)
    if (new Set(urls).size !== urls.length)
      ctx.addIssue({ code: 'custom', path: ['feeds'], message: 'takroriy feed URL' })
    const keys = s.keywordRules.map((r) => `${r.keyword}|${r.category}`)
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: 'custom',
        path: ['keywordRules'],
        message: 'takroriy keyword+category juftligi',
      })
  })

export const sourcesSeedSchema = z
  .array(sourceSchema)
  .min(1)
  .superRefine((list, ctx) => {
    const slugs = new Set<string>()
    list.forEach((s, i) => {
      if (slugs.has(s.slug))
        ctx.addIssue({ code: 'custom', path: [i, 'slug'], message: `takroriy slug: ${s.slug}` })
      slugs.add(s.slug)
    })
  })

export type SourceSeed = z.infer<typeof sourceSchema>
export type FeedSeed = z.infer<typeof feedSchema>
export type KeywordRule = z.infer<typeof keywordRuleSchema>
export type SourceSelectors = z.infer<typeof selectorsSchema>

/** Seed ichidagi barcha kategoriya havolalari mavjud kategoriyalarga ishora qilishini tekshiradi. */
export function findUnknownCategoryRefs(
  sources: SourceSeed[],
  categorySlugs: Iterable<string>,
): string[] {
  const known = new Set(categorySlugs)
  const errors: string[] = []
  for (const s of sources) {
    s.feeds.forEach((f, i) => {
      if (!known.has(f.mapsTo)) errors.push(`${s.slug}.feeds[${i}].mapsTo = ${f.mapsTo}`)
    })
    s.keywordRules.forEach((r, i) => {
      if (!known.has(r.category))
        errors.push(`${s.slug}.keywordRules[${i}].category = ${r.category}`)
    })
  }
  return errors
}
