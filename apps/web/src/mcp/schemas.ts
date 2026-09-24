import { GLOSSARY_KINDS, GLOSSARY_LANGUAGES, GUIDELINE_DOCS } from '@blog-odya/guidelines'
import { z } from 'zod'

import { POST_WORKFLOW_STATUSES } from '@/collections/Posts/workflow'
import { SCRAPED_ITEM_STATUSES } from '@/collections/ScrapedItems'

/**
 * MCP o'qish toollarining kirish sxemalari (TZ §6.3). Xato matnlari o'zbekcha — SDK ularni
 * "Input validation error: …" javobiga qo'shib agentga qaytaradi.
 */

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50

function int(field: string, { min, max }: { min?: number; max?: number } = {}) {
  let schema = z
    .number({
      error: (issue) =>
        issue.input === undefined ? `${field}: majburiy maydon` : `${field}: son bo'lishi kerak`,
    })
    .int({ error: `${field}: butun son bo'lishi kerak` })
  if (min !== undefined) schema = schema.min(min, { error: `${field}: kamida ${min}` })
  if (max !== undefined) schema = schema.max(max, { error: `${field}: ko'pi bilan ${max}` })
  return schema
}

export const idSchema = (field: string) => int(field, { min: 1 })

/** Sahifalash: `page` (1 dan), `limit` (1–50). */
export function paginationShape(defaultLimit = DEFAULT_PAGE_SIZE, maxLimit = MAX_PAGE_SIZE) {
  return {
    page: int('page', { min: 1 }).default(1).describe('Sahifa raqami (1 dan boshlanadi)'),
    limit: int('limit', { min: 1, max: maxLimit })
      .default(defaultLimit)
      .describe(`Bir sahifadagi yozuvlar soni (1–${maxLimit}, standart ${defaultLimit})`),
  }
}

/** ID (son) yoki slug (matn) — manba/kategoriya/teg filtri uchun. */
const idOrSlug = (field: string) =>
  z.union(
    [
      idSchema(field),
      z
        .string()
        .trim()
        .min(1, { error: `${field}: bo'sh bo'lmasin` }),
    ],
    {
      error: `${field}: ID (son) yoki slug (matn) bo'lishi kerak`,
    },
  )

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const localDate = (field: string) =>
  z.string().regex(DATE_RE, { error: `${field}: sana YYYY-MM-DD formatida bo'lishi kerak` })

const isoDateTime = (field: string) =>
  z.iso.datetime({
    offset: true,
    error: `${field}: ISO 8601 sana-vaqt bo'lishi kerak (masalan, 2026-09-24T08:00:00Z)`,
  })

const searchText = (field: string, max = 100) =>
  z
    .string()
    .trim()
    .min(1, { error: `${field}: bo'sh bo'lmasin` })
    .max(max, { error: `${field}: ko'pi bilan ${max} belgi` })

// ---------------------------------------------------------------------------

export const GUIDELINE_SECTIONS = GUIDELINE_DOCS.map((doc) => doc.id) as [
  (typeof GUIDELINE_DOCS)[number]['id'],
  ...(typeof GUIDELINE_DOCS)[number]['id'][],
]

export const getGuidelinesInput = {
  sections: z
    .array(z.enum(GUIDELINE_SECTIONS, { error: `sections: ${GUIDELINE_SECTIONS.join(', ')}` }))
    .optional()
    .describe("Qaysi bo'limlar (berilmasa — hammasi): style, copyright, seo, output-schema"),
}

export const getGlossaryInput = {
  query: searchText('query')
    .optional()
    .describe("Atama yoki tarjima bo'yicha qidiruv (katta-kichik harf farqlanmaydi)"),
  language: z
    .enum(GLOSSARY_LANGUAGES, { error: 'language: en yoki ru' })
    .optional()
    .describe('Asl til: en yoki ru'),
  kind: z
    .enum(GLOSSARY_KINDS, { error: `kind: ${GLOSSARY_KINDS.join(', ')}` })
    .optional()
    .describe('term — atama, brand — brend (tarjima qilinmaydi), abbreviation — qisqartma'),
  ...paginationShape(100, 200),
}

export const listSourcesInput = {
  includeInactive: z
    .boolean({ error: "includeInactive: true yoki false bo'lishi kerak" })
    .default(false)
    .describe("Nofaol manbalarni ham ko'rsatish"),
  ...paginationShape(),
}

export const SCRAPED_STATUS_FILTERS = ['new', ...SCRAPED_ITEM_STATUSES, 'all'] as const

export const SCRAPED_SORTS = ['-score', '-publishedAt', '-createdAt'] as const

export const listScrapedInput = {
  status: z
    .enum(SCRAPED_STATUS_FILTERS, { error: `status: ${SCRAPED_STATUS_FILTERS.join(', ')}` })
    .default('scraped')
    .describe(
      "Holat: scraped — to'liq matn tayyor (standart), new — ko'rib chiqilmagan (pending + scraped), " +
        'drafted, rejected, duplicate, error, pending, all — hammasi',
    ),
  date: localDate('date')
    .optional()
    .describe("Yig'ilgan kun (Toshkent vaqti, YYYY-MM-DD). from/to bilan birga ishlatilmaydi"),
  from: isoDateTime('from').optional().describe("Yig'ilgan vaqt ≥ from (ISO 8601)"),
  to: isoDateTime('to').optional().describe("Yig'ilgan vaqt < to (ISO 8601)"),
  source: idOrSlug('source').optional().describe('Manba: ID yoki slug'),
  category: idOrSlug('category').optional().describe('Taklif qilingan kategoriya: ID yoki slug'),
  minScore: int('minScore', { min: 0, max: 100 }).optional().describe('Minimal score (0–100)'),
  sort: z
    .enum(SCRAPED_SORTS, { error: `sort: ${SCRAPED_SORTS.join(', ')}` })
    .default('-score')
    .describe('Saralash: -score (standart), -publishedAt, -createdAt'),
  ...paginationShape(),
}

export const DEFAULT_SOURCE_TEXT_CHARS = 30_000
export const MAX_SOURCE_TEXT_CHARS = 100_000

export const getSourceInput = {
  id: idSchema('id').describe('scraped-item ID (list_scraped natijasidan)'),
  offset: int('offset', { min: 0 })
    .default(0)
    .describe("Matnning boshlanish nuqtasi (belgilar) — uzun matnni qismlab o'qish uchun"),
  maxChars: int('maxChars', { min: 1000, max: MAX_SOURCE_TEXT_CHARS })
    .default(DEFAULT_SOURCE_TEXT_CHARS)
    .describe(`Qaytariladigan matn uzunligi (belgilar, standart ${DEFAULT_SOURCE_TEXT_CHARS})`),
}

export const listDraftsInput = {
  status: z
    .array(
      z.enum(POST_WORKFLOW_STATUSES, {
        error: `status: ${POST_WORKFLOW_STATUSES.join(', ')}`,
      }),
    )
    .min(1, { error: "status: kamida bitta holat bo'lsin" })
    .default(['draft', 'in_progress'])
    .describe('Post holatlari (standart: draft, in_progress)'),
  assignee: z
    .union([z.enum(['me', 'unassigned']), idSchema('assignee')], {
      error: "assignee: 'me', 'unassigned' yoki foydalanuvchi ID",
    })
    .optional()
    .describe("Mas'ul: me — o'zim, unassigned — hech kimga biriktirilmagan, yoki foydalanuvchi ID"),
  ...paginationShape(),
}

export const searchPostsInput = {
  query: searchText('query')
    .optional()
    .describe("Qidiruv so'rovi (lotin yoki kirill). Berilmasa — oxirgi chop etilgan postlar"),
  category: idOrSlug('category').optional().describe('Kategoriya: ID yoki slug'),
  tag: idOrSlug('tag').optional().describe('Teg: ID yoki slug'),
  ...paginationShape(10),
}

export const listCategoriesInput = {
  ...paginationShape(50),
}

export const listTagsInput = {
  query: searchText('query').optional().describe("Nomi yoki slug bo'yicha qidiruv"),
  ...paginationShape(50),
}

// Prompt argumentlari — MCP'da faqat matn (string).

const numericString = (field: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, { error: `${field}: musbat butun son bo'lishi kerak` })

export const rewriteArticleArgs = {
  scrapedItemId: numericString('scrapedItemId').describe('scraped-item ID'),
}

export const dailyBatchArgs = {
  count: numericString('count').optional().describe('Nechta yangilik (standart 10, ko‘pi 30)'),
  minScore: numericString('minScore').optional().describe('Minimal score (standart 60)'),
}
