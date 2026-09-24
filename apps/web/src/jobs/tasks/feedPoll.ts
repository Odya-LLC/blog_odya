import type { Payload, TaskConfig } from 'payload'

import type { Source } from '@/payload-types'
import { fetchFeed, FeedHttpError, type FeedItem } from '@/scraping/feed'
import { hashUrl } from '@/scraping/url'

import {
  FEED_FETCH_TIMEOUT_MS,
  FEED_POLL_TASK,
  MIN_FETCH_WINDOW_MS,
  SCRAPE_ITEM_WORKFLOW,
  TASK_BUDGET_MS,
} from '../constants'
import { getRunDeadline } from '../context'
import { isFeedDue } from '../scheduler'
import { getJobsSettings, type JobsSettings } from '../settings'

/**
 * `feed.poll` (TZ §3.5 #1): bitta manbaning muddati kelgan (`pollIntervalMin`) faol feed'larini
 * ketma-ket o'qiydi, yangi URL'larni `urlHash` bo'yicha dedupe qiladi, har bir yangi URL uchun
 * `scraped-items` yozuvi (`pending`) yaratadi va `scrapeItem` workflow'ini navbatga qo'yadi.
 *
 * - Shartli so'rov: `ETag` → `If-None-Match`, `Last-Modified` → `If-Modified-Since`; `304` —
 *   o'zgarmagan.
 * - Domen bo'yicha odob: feed'lar orasida `rateLimitSec` pauza (robots `Crawl-delay`), oxirgi
 *   so'rov vaqti `sources.lastRequestAt` da.
 * - Vaqt: task ≤ `TASK_BUDGET_MS` va `/api/jobs/run` chegarasidan oshmaydi; ulgurmagan feed'lar
 *   muddati o'tgan holda qoladi va keyingi chaqiruvda (eng eskisi birinchi) o'qiladi.
 * - HTTP/parse xatolari task'ni yiqitmaydi — `feeds[].lastError` va `stats` ga yoziladi
 *   (ogohlantirishlar — M2-03). Kutilmagan (DB) xatolar — retry (3 marta, backoff).
 */

export interface FeedPollDeps {
  fetchImpl?: typeof fetch
  sleep: (ms: number) => Promise<void>
  now: () => number
}

/** Testlar `sleep`/`fetchImpl` ni almashtiradi (tarmoqsiz va pauzalarsiz). */
export const feedPollDeps: FeedPollDeps = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
}

export interface FeedPollOutput {
  polledFeeds: number
  notModified: number
  failedFeeds: number
  newItems: number
  duplicates: number
  skippedOld: number
  /** Vaqt yetmagani sababli keyingi chaqiruvga qolgan feed'lar. */
  deferredFeeds: number
}

type FeedRow = NonNullable<Source['feeds']>[number]

type Id = number

function relationId(value: unknown): Id | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return (value as { id: Id }).id
  return null
}

function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const record = current as {
      code?: unknown
      cause?: unknown
      data?: { errors?: { message?: string; path?: string }[] }
    }
    // Postgres unique_violation yoki Payload ValidationError ("Value must be unique").
    if (record.code === '23505') return true
    if (record.data?.errors?.some((e) => e.path === 'urlHash' && /unique/i.test(e.message ?? '')))
      return true
    current = record.cause
  }
  return false
}

interface Candidate {
  item: FeedItem
  url: string
  hash: string
}

/** Feed yozuvlarini normallashtiradi, eskilarini va bitta feed ichidagi takrorlarni tashlaydi. */
export function selectCandidates(
  items: FeedItem[],
  options: { now: number; maxItemAgeHours: number },
): { candidates: Candidate[]; skippedOld: number } {
  const minTime = options.now - options.maxItemAgeHours * 3_600_000
  const seen = new Set<string>()
  const candidates: Candidate[] = []
  let skippedOld = 0
  for (const item of items) {
    const normalized = hashUrl(item.link)
    if (!normalized || seen.has(normalized.hash)) continue
    seen.add(normalized.hash)
    if (item.publishedAt && Date.parse(item.publishedAt) < minTime) {
      skippedOld++
      continue
    }
    candidates.push({ item, url: normalized.url, hash: normalized.hash })
  }
  // Eng yangilari birinchi — `maxNewItemsPerPoll` chegarasida yangilar yo'qolmasin.
  candidates.sort(
    (a, b) => Date.parse(b.item.publishedAt ?? '0') - Date.parse(a.item.publishedAt ?? '0'),
  )
  return { candidates, skippedOld }
}

async function existingHashes(payload: Payload, hashes: string[]): Promise<Set<string>> {
  if (!hashes.length) return new Set()
  const { docs } = await payload.find({
    collection: 'scraped-items',
    where: { urlHash: { in: hashes } },
    select: { urlHash: true },
    depth: 0,
    pagination: false,
    limit: hashes.length,
  })
  return new Set(docs.map((doc) => doc.urlHash))
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'Timeout'
    return error.message
  }
  return String(error)
}

export async function pollSource(
  payload: Payload,
  sourceId: Id,
  options: { deps?: FeedPollDeps; settings?: JobsSettings } = {},
): Promise<FeedPollOutput> {
  const deps = options.deps ?? feedPollDeps
  const startedAt = deps.now()
  const runDeadline = getRunDeadline()
  const deadlineAt = Math.min(startedAt + TASK_BUDGET_MS, runDeadline ?? Number.POSITIVE_INFINITY)
  const settings = options.settings ?? (await getJobsSettings(payload))

  const output: FeedPollOutput = {
    polledFeeds: 0,
    notModified: 0,
    failedFeeds: 0,
    newItems: 0,
    duplicates: 0,
    skippedOld: 0,
    deferredFeeds: 0,
  }

  const source = await payload.findByID({
    collection: 'sources',
    id: sourceId,
    depth: 0,
    disableErrors: true,
  })
  if (!source || !source.isActive) return output

  const intervalMin = source.pollIntervalMin ?? settings.defaultPollIntervalMin
  const rateLimitMs = Math.max(1, source.rateLimitSec ?? 10) * 1000
  const feeds: FeedRow[] = (source.feeds ?? []).map((feed) => ({ ...feed }))
  const due = feeds
    .filter((feed) => isFeedDue(feed, intervalMin, startedAt))
    .sort((a, b) => Date.parse(a.lastPolledAt ?? '0') - Date.parse(b.lastPolledAt ?? '0'))

  let lastRequestAt = source.lastRequestAt ? Date.parse(source.lastRequestAt) : 0
  let remainingNew = settings.maxNewItemsPerPoll
  let lastError: string | null = null

  for (const [index, feed] of due.entries()) {
    const wait = Math.max(0, lastRequestAt + rateLimitMs - deps.now())
    if (deps.now() + wait + MIN_FETCH_WINDOW_MS > deadlineAt || remainingNew <= 0) {
      output.deferredFeeds = due.length - index
      break
    }
    if (wait > 0) await deps.sleep(wait)

    const requestAt = deps.now()
    lastRequestAt = requestAt
    feed.lastPolledAt = new Date(requestAt).toISOString()
    output.polledFeeds++

    try {
      const result = await fetchFeed(feed.url, {
        etag: feed.etag,
        lastModified: feed.lastModified,
        timeoutMs: Math.min(FEED_FETCH_TIMEOUT_MS, deadlineAt - requestAt),
        fetchImpl: deps.fetchImpl,
      })
      feed.lastStatus = result.httpStatus
      feed.lastError = null
      if (result.status === 'not-modified') {
        output.notModified++
        feed.lastNewItems = 0
        continue
      }

      const { candidates, skippedOld } = selectCandidates(result.items, {
        now: requestAt,
        maxItemAgeHours: settings.maxItemAgeHours,
      })
      output.skippedOld += skippedOld
      const existing = await existingHashes(
        payload,
        candidates.map((c) => c.hash),
      )
      const fresh = candidates.filter((c) => !existing.has(c.hash))
      output.duplicates += candidates.length - fresh.length

      const accepted = fresh.slice(0, remainingNew)
      let created = 0
      for (const candidate of accepted) {
        if (await createItem(payload, source, feed, candidate)) created++
        else output.duplicates++
      }
      remainingNew -= accepted.length
      output.newItems += created
      feed.lastNewItems = created

      // Chegara tufayli hammasi olinmagan bo'lsa, validatorlarni saqlamaymiz: keyingi poll
      // `304` olmasdan to'liq ro'yxatni qayta ko'radi va qolganlarini oladi.
      const truncated = fresh.length > accepted.length
      feed.etag = truncated ? null : result.etag
      feed.lastModified = truncated ? null : result.lastModified
    } catch (error) {
      const message = errorMessage(error)
      output.failedFeeds++
      lastError = `${feed.url}: ${message}`
      feed.lastStatus = error instanceof FeedHttpError ? error.httpStatus : null
      feed.lastError = message.slice(0, 1000)
      feed.lastNewItems = 0
    }
  }

  if (output.polledFeeds > 0) {
    const previous = (source.stats ?? {}) as Record<string, unknown>
    const allFailed = output.failedFeeds === output.polledFeeds
    const nowIso = new Date(deps.now()).toISOString()
    await payload.update({
      collection: 'sources',
      id: source.id,
      depth: 0,
      data: {
        feeds,
        lastRequestAt: new Date(lastRequestAt).toISOString(),
        stats: {
          ...previous,
          lastPollAt: nowIso,
          ...(allFailed ? {} : { lastSuccessAt: nowIso }),
          ...(lastError ? { lastErrorAt: nowIso, lastError } : {}),
          consecutiveFailures: allFailed ? Number(previous.consecutiveFailures ?? 0) + 1 : 0,
          lastPoll: output,
        },
      },
    })
  }

  return output
}

async function createItem(
  payload: Payload,
  source: Source,
  feed: FeedRow,
  candidate: Candidate,
): Promise<boolean> {
  const { item } = candidate
  let id: Id
  try {
    const doc = await payload.create({
      collection: 'scraped-items',
      depth: 0,
      data: {
        source: source.id,
        status: 'pending',
        title: item.title,
        url: item.link,
        canonicalUrl: candidate.url,
        urlHash: candidate.hash,
        author: item.author,
        publishedAt: item.publishedAt,
        language: source.language,
        excerpt: item.excerpt,
        sourceTags: item.categories.length ? item.categories : undefined,
        suggestedCategory: relationId(feed.mapsTo),
        fetchMeta: {
          feedUrl: feed.url,
          feedCategory: feed.feedCategory ?? null,
          guid: item.guid ?? null,
          discoveredAt: new Date().toISOString(),
        },
      },
    })
    id = doc.id
  } catch (error) {
    // Parallel poll (masalan, ikki manba bir xil havola bersa) — unique indeks himoya qiladi.
    if (isUniqueViolation(error)) return false
    throw error
  }

  await payload.jobs.queue({
    workflow: SCRAPE_ITEM_WORKFLOW,
    input: { scrapedItemId: id, contentHtml: item.contentHtml },
  })
  return true
}

export const feedPollTask: TaskConfig<'feed.poll'> = {
  slug: FEED_POLL_TASK,
  label: 'Feed poll (RSS)',
  interfaceName: 'TaskFeedPoll',
  retries: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
  inputSchema: [{ name: 'sourceId', type: 'number', required: true }],
  outputSchema: [
    { name: 'polledFeeds', type: 'number' },
    { name: 'notModified', type: 'number' },
    { name: 'failedFeeds', type: 'number' },
    { name: 'newItems', type: 'number' },
    { name: 'duplicates', type: 'number' },
    { name: 'skippedOld', type: 'number' },
    { name: 'deferredFeeds', type: 'number' },
  ],
  handler: async ({ input, req }) => {
    const output = await pollSource(req.payload, input.sourceId)
    return { output }
  },
}
