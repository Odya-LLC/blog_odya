import { GLOSSARY_KINDS, GLOSSARY_LANGUAGES, GUIDELINE_DOCS } from '@blog-odya/guidelines'
import { z } from 'zod'

import { POST_WORKFLOW_STATUSES } from '@/collections/Posts/workflow'
import { SCRAPED_ITEM_STATUSES } from '@/collections/ScrapedItems'

import { MEDIA_LICENSE_VALUES } from './media-policy'

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

// ---------------------------------------------------------------------------
// Yozish toollari (M2-07). Mazmun qoidalari (uzunliklar, kirill, SEO) — `validation.ts` da:
// ular `errors[]`/`warnings[]` sifatida qaytadi. Bu yerda — faqat tur va xavfsizlik chegaralari.
// ---------------------------------------------------------------------------

/** Bitta `create_draft` chaqiruvidagi maksimal elementlar soni (bir klasterdagi manbalar). */
export const MAX_DRAFT_ITEMS = 10
export const MAX_BODY_CHARS = 60_000
export const MAX_TAGS_INPUT = 10

const text = (field: string, max: number) =>
  z
    .string({
      error: (issue) =>
        issue.input === undefined ? `${field}: majburiy maydon` : `${field}: matn bo'lishi kerak`,
    })
    .max(max, { error: `${field}: ko'pi bilan ${max} belgi` })

const postId = () => idSchema('postId').describe('Post ID (create_draft / list_drafts natijasidan)')

export const createDraftInput = {
  scrapedItemIds: z
    .array(idSchema('scrapedItemIds[]'), {
      error: "scrapedItemIds: scraped-item ID'lari ro'yxati bo'lishi kerak",
    })
    .min(1, { error: 'scrapedItemIds: kamida bitta ID' })
    .max(MAX_DRAFT_ITEMS, { error: `scrapedItemIds: ko'pi bilan ${MAX_DRAFT_ITEMS} ta` })
    .describe(
      "Yig'ilgan element ID'lari (list_scraped). Birinchisi — asosiy manba; qolganlari (odatda " +
        "shu klasterdan) qo'shimcha atributsiya sifatida qo'shiladi",
    ),
  category: idOrSlug('category')
    .optional()
    .describe('Kategoriya: ID yoki slug. Berilmasa — elementning taklif qilingan kategoriyasi'),
}

export const postIdInput = {
  postId: postId(),
}

export const saveRewriteInput = {
  postId: postId(),
  title: text('title', 300).describe('Sarlavha (lotin, ≤ 70 belgi, focus keyword bilan)'),
  excerpt: text('excerpt', 1000).describe('Lid: 1–2 gap, 160–300 belgi (lotin)'),
  body: text('body', MAX_BODY_CHARS).describe(
    "Matn — Markdown (lotin): 400–900 so'z, ## / ### sarlavhalar, ro'yxatlar, havolalar, " +
      '> iqtibos, ``` kod, jadvallar. Rasm — alohida qatorda ![alt](media:ID) (upload_media); ' +
      'HTML va tashqi rasmlar olib tashlanadi; # (H1) ishlatilmaydi',
  ),
  category: idOrSlug('category').describe('Kategoriya: ID yoki slug (list_categories)'),
  tags: z
    .array(
      z.union([
        idSchema('tags[]'),
        text('tags[]', 100).trim().min(1, { error: "tags[]: bo'sh bo'lmasin" }),
      ]),
      {
        error: "tags: teg nomlari (matn) yoki ID'lari ro'yxati",
      },
    )
    .max(MAX_TAGS_INPUT, { error: `tags: ko'pi bilan ${MAX_TAGS_INPUT} ta` })
    .default([])
    .describe("3–7 ta teg: nomi (lotin) yoki ID. Mavjud bo'lmagan nom — yangi teg yaratiladi"),
}

export const setSeoInput = {
  postId: postId(),
  seoTitle: text('seoTitle', 300).describe("SEO sarlavha (≤ 60 belgi, «— Blog Odya» qo'shilmaydi)"),
  metaDescription: text('metaDescription', 1000).describe('Meta description (140–160 belgi)'),
  focusKeyword: text('focusKeyword', 200).describe("Asosiy kalit so'z: 1–4 so'zli ibora (lotin)"),
  faq: z
    .array(
      z.object({
        question: text('faq[].question', 300),
        answer: text('faq[].answer', 2000),
      }),
      { error: "faq: { question, answer } ro'yxati" },
    )
    .max(10, { error: "faq: ko'pi bilan 10 ta" })
    .optional()
    .describe("FAQ: 0 yoki 2–4 ta savol-javob (berilmasa — o'zgarmaydi, [] — o'chiriladi)"),
  coverAlt: text('coverAlt', 500)
    .optional()
    .describe("Muqova rasmi uchun alt matni taklifi (5–15 so'z)"),
}

export const submitForReviewInput = {
  postId: postId(),
  notesForEditor: text('notesForEditor', 5000)
    .optional()
    .describe(
      "Muharrir uchun izoh: tekshirib bo'lmagan faktlar, manbalar farqi, rasm taklifi, " +
        'topilmagan ichki havolalar',
    ),
}

// ---------------------------------------------------------------------------
// Media toollari (OBLOG-44). Litsenziya, alt va domen qoidalari — `media-policy.ts`.
// ---------------------------------------------------------------------------

/** base64 uchun: 10 MB fayl ≈ 13,4 mln belgi (+ `data:` prefiksi). */
export const MAX_BASE64_CHARS = 14_000_000

export const uploadMediaInput = {
  url: text('url', 2048)
    .trim()
    .optional()
    .describe(
      "Rasm fayliga to'g'ridan-to'g'ri havola (http/https; JPEG, PNG, WebP; ≤ 10 MB). " +
        'data bilan birga berilmaydi. Agentliklar, foto-banklar va yangilik manbalarimiz domenlari rad etiladi',
    ),
  data: z
    .string({ error: "data: base64 matn bo'lishi kerak" })
    .max(MAX_BASE64_CHARS, { error: 'data: fayl 10 MB dan oshmasin' })
    .optional()
    .describe(
      'Fayl mazmuni — base64 (yoki data:image/...;base64,...). url o‘rniga; filename bilan',
    ),
  filename: text('filename', 200)
    .trim()
    .optional()
    .describe('Fayl nomi (data bilan; masalan, iphone-18.jpg)'),
  alt: text('alt', 300).describe("Alt matni (majburiy): 5–15 so'z, lotin — kirill avtomatik"),
  caption: text('caption', 500).optional().describe('Izoh (caption), lotin — ixtiyoriy'),
  credit: text('credit', 200)
    .optional()
    .describe(
      'Kredit: «Rasm: Apple», «Rasm: Muallif / Unsplash». press_kit, unsplash, pexels, cc_by, other uchun majburiy',
    ),
  license: z
    .enum(MEDIA_LICENSE_VALUES, { error: `license: ${MEDIA_LICENSE_VALUES.join(', ')}` })
    .describe(
      'Litsenziya (majburiy): press_kit, unsplash, pexels, cc_by (licenseUrl bilan), own, ' +
        'ai_generated, other (licenseNote bilan)',
    ),
  licenseUrl: text('licenseUrl', 500)
    .trim()
    .optional()
    .describe('Litsenziya havolasi (cc_by uchun majburiy)'),
  licenseNote: text('licenseNote', 1000)
    .optional()
    .describe('Litsenziya izohi — other uchun majburiy (yozma ruxsat kimdan, qachon)'),
  sourceUrl: text('sourceUrl', 2048)
    .trim()
    .optional()
    .describe(
      'Rasm topilgan sahifa (Unsplash/Pexels sahifasi, press-reliz). url berilsa — standart shu',
    ),
}

export const setCoverInput = {
  postId: postId(),
  mediaId: idSchema('mediaId').describe('Media ID (upload_media / list_media natijasidan)'),
  alt: text('alt', 300)
    .optional()
    .describe(
      "Muqova alt matni (5–15 so'z, lotin) — postning coverAlt maydoniga; berilmasa media alt",
    ),
}

export const MEDIA_LICENSE_FILTERS = [...MEDIA_LICENSE_VALUES, 'all'] as const

export const listMediaInput = {
  query: searchText('query')
    .optional()
    .describe("Fayl nomi, alt, izoh yoki kredit bo'yicha qidiruv (masalan, «Apple», «logo»)"),
  license: z
    .enum(MEDIA_LICENSE_FILTERS, { error: `license: ${MEDIA_LICENSE_FILTERS.join(', ')}` })
    .default('all')
    .describe('Litsenziya filtri (standart: all)'),
  mine: z
    .boolean({ error: "mine: true yoki false bo'lishi kerak" })
    .default(false)
    .describe('Faqat men (shu API kalit egasi) yuklagan fayllar'),
  ...paginationShape(),
}

export const searchStockImagesInput = {
  query: searchText('query').describe(
    'Qidiruv (inglizcha yaxshiroq ishlaydi: «iphone», «data center»)',
  ),
  orientation: z
    .enum(['landscape', 'portrait', 'square'], {
      error: 'orientation: landscape, portrait, square',
    })
    .optional()
    .describe('Yo‘nalish (muqova uchun — landscape)'),
  ...paginationShape(10, 30),
}
