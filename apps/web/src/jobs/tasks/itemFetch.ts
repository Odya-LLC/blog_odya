import type { Payload, TaskConfig } from 'payload'

import type { ScrapedItem, Source } from '@/payload-types'
import { archiveKey, putHtml } from '@/scraping/archive'
import { fetchPage, PAGE_FETCH_TIMEOUT_MS, PageFetchError } from '@/scraping/page'
import {
  evaluateRobots,
  fetchRobots,
  isRobotsEntryFresh,
  type RobotsCache,
  type RobotsCacheEntry,
  type RobotsDecision,
} from '@/scraping/robots'
import { reserveRequestSlot, saveRobotsEntry } from '@/scraping/sourceState'

import {
  EXTRACT_RESERVE_MS,
  ITEM_FETCH_TASK,
  MIN_PAGE_FETCH_WINDOW_MS,
  SCRAPE_TASK_RETRIES,
  TASK_BUDGET_MS,
} from '../constants'
import { getRunDeadline } from '../context'
import { getArchiveStorage, scrapeDeps, type ScrapeDeps } from '../scrapeDeps'

/**
 * `item.fetch` (TZ §3.5 #2): bitta `scraped-items` elementi uchun manba HTML'ini oladi va
 * **gzip qilib arxivga** (R2 `raw/{source}/{yyyy-mm}/{id}.html.gz`) yozadi. DB'ga va job
 * log'iga HTML tushmaydi — `item.extract` uni arxivdan o'qiydi.
 *
 * - `fetchMode = rss_only` — sahifa yuklanmaydi: RSS'dagi HTML (yoki description) arxivlanadi.
 * - `rss_plus_page` — avval robots.txt (24 soat kesh, `sources.robotsCache`): taqiqlangan URL
 *   **yuklanmaydi**, RSS matni ishlatiladi. Keyin domen bo'yicha rate limit: `sources.lastRequestAt`
 *   da atomar slot (`max(rateLimitSec, Crawl-delay)`); slot task byudjetiga sig'masa — job
 *   `deferred` (workflow uni slot vaqtiga qayta navbatga qo'yadi, retry sarflanmaydi).
 * - So'rov: `OdyaBlogBot/1.0` UA, timeout ≤ 15 s (va `/api/jobs/run` chegarasi), ≤ 5 MB.
 * - Doimiy xatolar (404/410, HTML emas, juda katta) — retry'siz `status = error`;
 *   vaqtinchalik (5xx, 429, timeout, tarmoq) — throw → 3 retry (backoff), oxirida `error`.
 */

export type ItemFetchStatus = 'fetched' | 'rss' | 'deferred' | 'skipped'

export interface ItemFetchOutput {
  status: ItemFetchStatus
  /** `page` — sahifa yuklandi; `rss` — RSS matni ishlatildi. */
  mode?: 'page' | 'rss'
  rawHtmlKey?: string
  /** `deferred`: qayta urinish vaqti (ISO). */
  retryAt?: string
  /** `rss`/`skipped` sababi: `rss_only`, `robots`, `not-pending`, `not-found`, `http-404`... */
  reason?: string
  httpStatus?: number
  finalUrl?: string
  bytes?: number
  charset?: string
  robots?: string
}

type Id = number

function relationId(value: unknown): Id | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return (value as { id: Id }).id
  return null
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** RSS matni: `content:encoded`/`content`, bo'lmasa description (`excerpt`). */
export function rssHtml(contentHtml: string | null | undefined, item: ScrapedItem): string {
  if (contentHtml?.trim()) return contentHtml
  return item.excerpt ? `<p>${escapeHtml(item.excerpt)}</p>` : ''
}

/** Element holatini `error` ga o'tkazadi (retry qilinmaydigan yoki oxirgi xato). */
export async function markItemError(payload: Payload, id: Id, message: string): Promise<void> {
  await payload.update({
    collection: 'scraped-items',
    id,
    depth: 0,
    data: { status: 'error', error: message.slice(0, 2000) },
  })
}

async function loadItem(
  payload: Payload,
  id: Id,
): Promise<{ item: ScrapedItem; source: Source } | { skip: string }> {
  const item = await payload.findByID({
    collection: 'scraped-items',
    id,
    depth: 0,
    disableErrors: true,
  })
  if (!item) return { skip: 'not-found' }
  // Faqat navbatdagi elementlar (qo'lda qayta ishga tushirish uchun `error` ham).
  if (item.status !== 'pending' && item.status !== 'error') return { skip: 'not-pending' }
  const sourceId = relationId(item.source)
  const source = sourceId
    ? await payload.findByID({ collection: 'sources', id: sourceId, depth: 0, disableErrors: true })
    : null
  if (!source) return { skip: 'source-not-found' }
  return { item, source }
}

/**
 * Bir jarayonda parallel ishlayotgan job'lar (bitta batch) robots.txt'ni bir marta so'rashi
 * uchun: origin → yuklanayotgan yozuv.
 */
const robotsInflight = new Map<string, Promise<RobotsCacheEntry>>()

async function checkRobots(
  payload: Payload,
  source: Source,
  pageUrl: string,
  deps: ScrapeDeps,
): Promise<RobotsDecision> {
  const origin = new URL(pageUrl).origin
  const cache = (source.robotsCache ?? {}) as RobotsCache
  let entry = cache[origin]
  if (!isRobotsEntryFresh(entry, origin, deps.now())) {
    const key = `${source.id}|${origin}`
    let pending = robotsInflight.get(key)
    if (!pending) {
      pending = (async () => {
        const fresh = await fetchRobots(origin, { fetchImpl: deps.fetchImpl, now: deps.now() })
        await saveRobotsEntry(payload, source.id, fresh)
        return fresh
      })().finally(() => robotsInflight.delete(key))
      robotsInflight.set(key, pending)
    }
    entry = await pending
  }
  return evaluateRobots(entry, pageUrl)
}

export async function fetchItem(
  payload: Payload,
  input: { scrapedItemId: Id; contentHtml?: string | null },
  options: { deps?: ScrapeDeps } = {},
): Promise<ItemFetchOutput> {
  const deps = options.deps ?? scrapeDeps
  const startedAt = deps.now()
  const loaded = await loadItem(payload, input.scrapedItemId)
  if ('skip' in loaded) return { status: 'skipped', reason: loaded.skip }
  const { item, source } = loaded

  const storage = getArchiveStorage()
  if (!storage) throw new Error('Arxiv sozlanmagan (S3_RAW_BUCKET) — HTML saqlab bo‘lmaydi')
  const key = archiveKey(source.slug, item.createdAt, item.id, 'raw')

  const fallbackToRss = async (reason: string, robots?: string): Promise<ItemFetchOutput> => {
    const html = rssHtml(input.contentHtml, item)
    const bytes = await putHtml(storage, key, html)
    return {
      status: 'rss',
      mode: 'rss',
      rawHtmlKey: key,
      reason,
      bytes,
      ...(robots ? { robots } : {}),
    }
  }

  if (source.fetchMode !== 'rss_plus_page') return fallbackToRss('rss_only')

  // Normallashtirilgan URL (utm_* va #fragment'siz — Habr robots.txt `?utm_` ni yopgan).
  const pageUrl = item.canonicalUrl || item.url
  const robots = await checkRobots(payload, source, pageUrl, deps)
  if (!robots.allowed) return fallbackToRss('robots', robots.rule)

  const runDeadline = getRunDeadline()
  const deadlineAt = Math.min(
    startedAt + TASK_BUDGET_MS,
    (runDeadline ?? Number.POSITIVE_INFINITY) - EXTRACT_RESERVE_MS,
  )
  const intervalMs = Math.max(source.rateLimitSec ?? 10, robots.crawlDelaySec ?? 0, 1) * 1000
  const reservation = await reserveRequestSlot(payload, source.id, {
    intervalMs,
    now: deps.now(),
    latestAt: deadlineAt - MIN_PAGE_FETCH_WINDOW_MS,
  })
  if (!reservation.reserved) {
    return { status: 'deferred', retryAt: new Date(reservation.nextAt).toISOString() }
  }
  const wait = reservation.slotAt - deps.now()
  if (wait > 0) await deps.sleep(wait)

  try {
    const page = await fetchPage(pageUrl, {
      timeoutMs: Math.min(PAGE_FETCH_TIMEOUT_MS, deadlineAt - deps.now()),
      fetchImpl: deps.fetchImpl,
    })
    const bytes = await putHtml(storage, key, page.html)
    return {
      status: 'fetched',
      mode: 'page',
      rawHtmlKey: key,
      httpStatus: page.httpStatus,
      finalUrl: page.finalUrl,
      bytes,
      charset: page.charset,
      robots: robots.rule,
    }
  } catch (error) {
    if (error instanceof PageFetchError && error.permanent) {
      await markItemError(payload, item.id, `item.fetch: ${pageUrl}: ${error.message}`)
      return {
        status: 'skipped',
        reason: error.httpStatus ? `http-${error.httpStatus}` : 'invalid-page',
        ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}),
      }
    }
    throw error
  }
}

export const itemFetchTask: TaskConfig<'item.fetch'> = {
  slug: ITEM_FETCH_TASK,
  label: 'Sahifani yuklash (item.fetch)',
  interfaceName: 'TaskItemFetch',
  retries: SCRAPE_TASK_RETRIES,
  // RSS matni task input'iga ko'chirilmaydi (job log'ini shishirmaslik uchun) — workflow
  // input'idan (`job.input.contentHtml`) o'qiladi.
  inputSchema: [{ name: 'scrapedItemId', type: 'number', required: true }],
  outputSchema: [
    { name: 'status', type: 'text', required: true },
    { name: 'mode', type: 'text' },
    { name: 'rawHtmlKey', type: 'text' },
    { name: 'retryAt', type: 'text' },
    { name: 'reason', type: 'text' },
    { name: 'httpStatus', type: 'number' },
    { name: 'finalUrl', type: 'text' },
    { name: 'bytes', type: 'number' },
    { name: 'charset', type: 'text' },
    { name: 'robots', type: 'text' },
  ],
  handler: async ({ input, job, req }) => {
    const contentHtml = (job.input as { contentHtml?: string | null } | undefined)?.contentHtml
    const output = await fetchItem(req.payload, { scrapedItemId: input.scrapedItemId, contentHtml })
    return { output }
  },
}
