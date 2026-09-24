import type { Payload, PayloadRequest, TaskConfig } from 'payload'

import type { ScrapedItem, Source } from '@/payload-types'
import { classifyText, computeScore, type KeywordRule } from '@/scraping/classify'
import { writeAnalysisResult } from '@/scraping/itemState'

import { ITEM_CLASSIFY_TASK, SCRAPE_TASK_RETRIES } from '../constants'

/**
 * `item.classify` (TZ §3.5 #5, LLM'siz): `suggestedCategory` va `score` (0–100).
 *
 * - Kategoriya — element topilgan feed mapping'i (`fetchMeta.feedUrl` → `sources.feeds[]`,
 *   `mapsTo` + `mappingWeight`) va manbaning `keywordRules` (sarlavha + excerpt + manba teglari).
 *   Algoritm — `src/scraping/classify.ts`, aniqligi — `tests/classify-accuracy.test.ts`.
 * - Score = manba `priority` + yangilik (`publishedAt`, soat) + klaster hajmi (`clusterId`
 *   bo'yicha elementlar soni) + g'olib kategoriya kalit so'z boost'i.
 * - Hisob tafsilotlari `fetchMeta.classify` da (muharrir va sozlash uchun).
 * - `drafted` elementda muharrir tanlagan kategoriya o'zgarmaydi — faqat score
 *   (`planAnalysisWrite`).
 */

export interface ItemClassifyOutput {
  status: 'classified' | 'skipped'
  categoryId?: number | null
  score?: number
}

type Id = number

function relationId(value: unknown): Id | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return (value as { id: Id }).id
  return null
}

type FeedRow = NonNullable<Source['feeds']>[number]

/** Element qaysi feed'dan topilgan (`feed.poll` → `fetchMeta.feedUrl`). */
export function findItemFeed(source: Pick<Source, 'feeds'>, item: Pick<ScrapedItem, 'fetchMeta'>) {
  const feedUrl = (item.fetchMeta as { feedUrl?: unknown } | null | undefined)?.feedUrl
  if (typeof feedUrl !== 'string') return null
  return (source.feeds ?? []).find((feed: FeedRow) => feed.url === feedUrl) ?? null
}

export function sourceRules(source: Pick<Source, 'keywordRules'>): KeywordRule<Id>[] {
  const rules: KeywordRule<Id>[] = []
  for (const rule of source.keywordRules ?? []) {
    const category = relationId(rule.category)
    if (category === null || !rule.keyword) continue
    rules.push({ keyword: rule.keyword, category, boost: rule.boost ?? 0 })
  }
  return rules
}

async function clusterSize(
  payload: Payload,
  item: ScrapedItem,
  req: PayloadRequest,
): Promise<number> {
  if (!item.clusterId) return 1
  const { totalDocs } = await payload.count({
    collection: 'scraped-items',
    where: { clusterId: { equals: item.clusterId } },
    req,
  })
  return Math.max(1, totalDocs)
}

export async function classifyItem(
  payload: Payload,
  id: Id,
  now: number = Date.now(),
): Promise<ItemClassifyOutput> {
  const { result } = await writeAnalysisResult<ItemClassifyOutput>(
    payload,
    id,
    async ({ req, item }) => {
      const sourceId = relationId(item.source)
      const source = sourceId
        ? await payload.findByID({
            collection: 'sources',
            id: sourceId,
            depth: 0,
            req,
            disableErrors: true,
          })
        : null
      if (!source) return null

      const feed = findItemFeed(source, item)
      const feedCategory = relationId(feed?.mapsTo)
      const classified = classifyText({
        feedCategory,
        feedWeight: feed?.mappingWeight,
        rules: sourceRules(source),
        title: item.title,
        excerpt: item.excerpt,
        tags: item.sourceTags,
      })
      const size = await clusterSize(payload, item, req)
      const score = computeScore({
        priority: source.priority,
        publishedAt: item.publishedAt ?? item.createdAt,
        now,
        clusterSize: size,
        keywordBoost: classified.keywordBoost,
      })

      const previousMeta = (item.fetchMeta ?? {}) as Record<string, unknown>
      const category = classified.category ?? relationId(item.suggestedCategory)
      return {
        data: {
          suggestedCategory: category,
          score: score.total,
          fetchMeta: {
            ...previousMeta,
            classify: {
              feedCategory,
              feedWeight: feed?.mappingWeight ?? null,
              points: Object.fromEntries(classified.points),
              matched: classified.matched.map((rule) => rule.keyword),
              score,
              clusterSize: size,
              classifiedAt: new Date(now).toISOString(),
            },
          },
        },
        result: { status: 'classified', categoryId: category, score: score.total },
      }
    },
  )
  return result ?? { status: 'skipped' }
}

export const itemClassifyTask: TaskConfig<'item.classify'> = {
  slug: ITEM_CLASSIFY_TASK,
  label: 'Kategoriya va score (item.classify)',
  interfaceName: 'TaskItemClassify',
  retries: SCRAPE_TASK_RETRIES,
  inputSchema: [{ name: 'scrapedItemId', type: 'number', required: true }],
  outputSchema: [
    { name: 'status', type: 'text', required: true },
    { name: 'categoryId', type: 'number' },
    { name: 'score', type: 'number' },
  ],
  handler: async ({ input, req }) => {
    const output = await classifyItem(req.payload, input.scrapedItemId)
    return { output }
  },
}
