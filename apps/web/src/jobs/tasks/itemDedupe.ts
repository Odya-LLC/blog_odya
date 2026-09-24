import { sql } from '@payloadcms/db-postgres'
import type { Payload, TaskConfig } from 'payload'

import type { ScrapedItem } from '@/payload-types'
import { transactionDb, writeAnalysisResult } from '@/scraping/itemState'
import { hammingDistance, isSimhash, simhash } from '@/scraping/simhash'

import {
  DEDUPE_MAX_DISTANCE,
  DEDUPE_WINDOW_HOURS,
  ITEM_DEDUPE_TASK,
  SCRAPE_TASK_RETRIES,
} from '../constants'

/**
 * `item.dedupe` (TZ §3.5 #4): matndan 64-bit SimHash (`contentHash`) hisoblaydi va oxirgi
 * `DEDUPE_WINDOW_HOURS` (72 soat) ichidagi elementlar bilan solishtiradi:
 * - Hamming ≤ `DEDUPE_MAX_DISTANCE` (3) yoki bir xil canonical URL — o'sha elementning
 *   `clusterId` si (eng yaqini); aks holda yangi klaster `c<id>`;
 * - **aniq dublikat** (o'sha manba, masofa 0 — bir maqola boshqa URL'da qayta chiqqan) —
 *   `status = duplicate` (navbatda ko'rinmaydi). Boshqa manbadagi o'xshash yangilik navbatda
 *   qoladi va tahririyat navbatida klaster sifatida guruhlanadi (M5-03: klasterdan 1 qoralama).
 *
 * Samaradorlik: butun jadval bilan solishtirilmaydi — `created_at >= now - 72h`
 * (`scraped_items_created_at_idx`) va `content_hash IS NOT NULL`; kuniga ~150 element → ≈ 450
 * nomzod, masofa JS'da (XOR + popcount). Parallel job'lar bir xil yangilikni ikki klasterga
 * ajratmasligi uchun nomzodlarni o'qish va yozish `pg_advisory_xact_lock` ostida (qisqa).
 */

export interface ItemDedupeOutput {
  status: 'clustered' | 'unique' | 'duplicate' | 'no-text' | 'skipped'
  contentHash?: string
  clusterId?: string
  matchId?: number
  distance?: number
}

/** `item.dedupe` tranzaksiyalarini ketma-ketlashtirish uchun advisory lock kaliti. */
const DEDUPE_LOCK_KEY = 170_017

/** SimHash uchun matn: sarlavha + to'liq matn (bo'lmasa RSS excerpt). */
export function dedupeText(item: Pick<ScrapedItem, 'title' | 'extractedText' | 'excerpt'>): string {
  return [item.title, item.extractedText || item.excerpt].filter(Boolean).join('\n')
}

export interface DedupeCandidate {
  id: number
  contentHash: string | null
  clusterId: string | null
  sourceId: number | null
  canonicalUrl: string | null
}

export interface DedupeMatch {
  candidate: DedupeCandidate
  distance: number
}

/** Eng yaqin nomzod (bir xil canonical URL — masofa 0 deb olinadi). Sof funksiya. */
export function findClusterMatch(
  hash: string,
  canonicalUrl: string | null | undefined,
  candidates: readonly DedupeCandidate[],
  maxDistance = DEDUPE_MAX_DISTANCE,
): DedupeMatch | null {
  let best: DedupeMatch | null = null
  for (const candidate of candidates) {
    const sameUrl = Boolean(canonicalUrl) && candidate.canonicalUrl === canonicalUrl
    const distance = sameUrl
      ? 0
      : isSimhash(candidate.contentHash)
        ? hammingDistance(hash, candidate.contentHash)
        : Number.POSITIVE_INFINITY
    if (distance > maxDistance) continue
    if (!best || distance < best.distance) best = { candidate, distance }
  }
  return best
}

function relationId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return (value as { id: number }).id
  return null
}

type Rows<T> = { rows: T[] }

export async function dedupeItem(
  payload: Payload,
  id: number,
  now: number = Date.now(),
): Promise<ItemDedupeOutput> {
  const { result } = await writeAnalysisResult<ItemDedupeOutput>(
    payload,
    id,
    async ({ req, item }) => {
      const hash = simhash(dedupeText(item))
      if (!hash) {
        return {
          data: { contentHash: null, clusterId: `c${item.id}` },
          result: { status: 'no-text', clusterId: `c${item.id}` },
        }
      }

      const db = await transactionDb(req)
      await db.execute(sql`SELECT pg_advisory_xact_lock(${DEDUPE_LOCK_KEY})`)
      const since = new Date(now - DEDUPE_WINDOW_HOURS * 3_600_000).toISOString()
      const { rows } = (await db.execute(sql`
      SELECT "id", "content_hash" AS "contentHash", "cluster_id" AS "clusterId",
        "source_id" AS "sourceId", "canonical_url" AS "canonicalUrl"
      FROM "scraped_items"
      WHERE "created_at" >= ${since}::timestamptz
        AND "id" <> ${item.id}
        AND "content_hash" IS NOT NULL
    `)) as unknown as Rows<DedupeCandidate>

      const match = findClusterMatch(hash, item.canonicalUrl, rows)
      const clusterId =
        match?.candidate.clusterId || (match ? `c${match.candidate.id}` : `c${item.id}`)
      const exactDuplicate =
        match !== null &&
        match.distance === 0 &&
        match.candidate.sourceId === relationId(item.source) &&
        item.status === 'scraped'

      const data: Partial<ScrapedItem> = { contentHash: hash, clusterId }
      if (exactDuplicate) data.status = 'duplicate'
      // Klastersiz eski element (M2-03 dan oldin) bilan mos kelsa — unga ham klaster yoziladi.
      if (match && !match.candidate.clusterId) {
        await db.execute(sql`
        UPDATE "scraped_items" SET "cluster_id" = ${clusterId}
        WHERE "id" = ${match.candidate.id} AND "cluster_id" IS NULL
      `)
      }
      return {
        data,
        result: {
          status: exactDuplicate ? 'duplicate' : match ? 'clustered' : 'unique',
          contentHash: hash,
          clusterId,
          ...(match ? { matchId: match.candidate.id, distance: match.distance } : {}),
        },
      }
    },
  )
  return result ?? { status: 'skipped' }
}

export const itemDedupeTask: TaskConfig<'item.dedupe'> = {
  slug: ITEM_DEDUPE_TASK,
  label: 'Dublikatlarni aniqlash (item.dedupe)',
  interfaceName: 'TaskItemDedupe',
  retries: SCRAPE_TASK_RETRIES,
  inputSchema: [{ name: 'scrapedItemId', type: 'number', required: true }],
  outputSchema: [
    { name: 'status', type: 'text', required: true },
    { name: 'contentHash', type: 'text' },
    { name: 'clusterId', type: 'text' },
    { name: 'matchId', type: 'number' },
    { name: 'distance', type: 'number' },
  ],
  handler: async ({ input, req }) => {
    const output = await dedupeItem(req.payload, input.scrapedItemId)
    return { output }
  },
}
