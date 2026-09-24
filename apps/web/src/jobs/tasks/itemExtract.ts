import { selectorsSchema } from '@blog-odya/shared'
import type { Payload, TaskConfig } from 'payload'

import type { ScrapedItem } from '@/payload-types'
import { archiveKey, getHtml, putHtml } from '@/scraping/archive'
import { extractArticle, type ExtractMode, type ExtractResult } from '@/scraping/extract'
import { normalizeUrl } from '@/scraping/url'

import { ITEM_EXTRACT_TASK, SCRAPE_TASK_RETRIES } from '../constants'
import { getArchiveStorage } from '../scrapeDeps'

/**
 * `item.extract` (TZ §3.5 #3): arxivdagi raw HTML'dan (`item.fetch` yozgan) matn va metadatani
 * ajratadi (`src/scraping/extract.ts`), tozalangan HTML'ni gzip qilib arxivga
 * (`raw/{source}/{yyyy-mm}/{id}.clean.html.gz`) yozadi va `scraped-items` ni yangilaydi:
 * sarlavha, muallif, sana, teglar, `og:image`, rasm URL'lari, so'zlar soni, `extractedText`
 * (Markdown), R2 kalitlari, `status = scraped`. DB'ga HTML yozilmaydi.
 */

export interface ItemExtractOutput {
  status: 'scraped' | 'empty' | 'skipped'
  method?: ExtractResult['method']
  wordCount?: number
  cleanHtmlKey?: string
}

type Id = number

function relationId(value: unknown): Id | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return (value as { id: Id }).id
  return null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Arxiv uchun mustaqil HTML hujjat (ochib o'qish qulay bo'lsin). */
export function cleanDocument(result: ExtractResult, url: string): string {
  const lang = result.lang ? ` lang="${escapeHtml(result.lang)}"` : ''
  return [
    '<!doctype html>',
    `<html${lang}>`,
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(result.title ?? '')}</title>`,
    `<link rel="canonical" href="${escapeHtml(result.canonicalUrl ?? url)}">`,
    '</head>',
    '<body>',
    `<article>${result.cleanHtml}</article>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

export async function extractItem(
  payload: Payload,
  input: {
    scrapedItemId: Id
    rawHtmlKey: string
    mode: ExtractMode
    fetchMeta?: Record<string, unknown> | null
  },
): Promise<ItemExtractOutput> {
  const item = await payload.findByID({
    collection: 'scraped-items',
    id: input.scrapedItemId,
    depth: 0,
    disableErrors: true,
  })
  if (!item || (item.status !== 'pending' && item.status !== 'error')) return { status: 'skipped' }
  const sourceId = relationId(item.source)
  const source = sourceId
    ? await payload.findByID({ collection: 'sources', id: sourceId, depth: 0, disableErrors: true })
    : null
  if (!source) return { status: 'skipped' }

  const storage = getArchiveStorage()
  if (!storage) throw new Error('Arxiv sozlanmagan (S3_RAW_BUCKET)')
  const html = await getHtml(storage, input.rawHtmlKey)
  // `item.fetch` qayta ishga tushiriladi (retry) — bu vaqtinchalik holat bo'lishi mumkin.
  if (html === null) throw new Error(`Arxivda raw HTML topilmadi: ${input.rawHtmlKey}`)

  const selectors = selectorsSchema.partial().safeParse(source.selectors ?? {})
  const url = item.canonicalUrl || item.url
  const result = extractArticle({
    html,
    url,
    mode: input.mode,
    selectors: selectors.success ? selectors.data : null,
    fallback: {
      title: item.title,
      author: item.author,
      publishedAt: item.publishedAt,
      tags: item.sourceTags,
      excerpt: item.excerpt,
    },
  })

  const previousMeta = (item.fetchMeta ?? {}) as Record<string, unknown>
  const extractMeta = {
    method: result.method,
    lang: result.lang,
    selectorsValid: selectors.success,
    extractedAt: new Date().toISOString(),
  }

  if (result.method === 'none') {
    await payload.update({
      collection: 'scraped-items',
      id: item.id,
      depth: 0,
      data: {
        status: 'error',
        error: 'item.extract: matn ajratilmadi (sahifa va RSS bo‘sh)',
        rawHtmlKey: input.rawHtmlKey,
        fetchMeta: { ...previousMeta, fetch: input.fetchMeta ?? null, extract: extractMeta },
      },
    })
    return { status: 'empty', method: result.method }
  }

  const cleanHtmlKey = archiveKey(source.slug, item.createdAt, item.id, 'clean')
  await putHtml(storage, cleanHtmlKey, cleanDocument(result, url))

  const data: Partial<ScrapedItem> = {
    status: 'scraped',
    error: null,
    title: result.title ?? item.title,
    author: result.author ?? item.author,
    publishedAt: result.publishedAt ?? item.publishedAt,
    canonicalUrl: (result.canonicalUrl && normalizeUrl(result.canonicalUrl)) || item.canonicalUrl,
    ogImage: result.ogImage,
    imageUrls: result.imageUrls.map((image) => ({ url: image.url, alt: image.alt ?? null })),
    sourceTags: result.tags.length ? result.tags : item.sourceTags,
    excerpt: item.excerpt ?? result.excerpt,
    extractedText: result.markdown,
    wordCount: result.wordCount,
    rawHtmlKey: input.rawHtmlKey,
    cleanHtmlKey,
    fetchMeta: { ...previousMeta, fetch: input.fetchMeta ?? null, extract: extractMeta },
  }
  await payload.update({ collection: 'scraped-items', id: item.id, depth: 0, data })
  return { status: 'scraped', method: result.method, wordCount: result.wordCount, cleanHtmlKey }
}

export const itemExtractTask: TaskConfig<'item.extract'> = {
  slug: ITEM_EXTRACT_TASK,
  label: 'Matnni ajratish (item.extract)',
  interfaceName: 'TaskItemExtract',
  retries: SCRAPE_TASK_RETRIES,
  inputSchema: [
    { name: 'scrapedItemId', type: 'number', required: true },
    { name: 'rawHtmlKey', type: 'text', required: true },
    {
      name: 'mode',
      type: 'select',
      required: true,
      options: ['page', 'rss'],
    },
    { name: 'fetchMeta', type: 'json' },
  ],
  outputSchema: [
    { name: 'status', type: 'text', required: true },
    { name: 'method', type: 'text' },
    { name: 'wordCount', type: 'number' },
    { name: 'cleanHtmlKey', type: 'text' },
  ],
  handler: async ({ input, req }) => {
    const output = await extractItem(req.payload, {
      ...input,
      fetchMeta: (input.fetchMeta ?? null) as Record<string, unknown> | null,
    })
    return { output }
  },
}
