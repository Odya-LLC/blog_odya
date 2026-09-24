import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'

import type { ScrapedItem } from '@/payload-types'

/**
 * `scraped-items` holatiga kim egalik qiladi (M2-02 job'lari ↔ M2-04 tahririyat navbati).
 *
 * - `pending` / `error` — element job'lar qo'lida: `item.fetch` / `item.extract` holatni
 *   (`scraped`, `error`) o'zgartiradi.
 * - `drafted` — muharrir elementni qoralamaga olgan (masalan, matn hali ajratilmagan `pending`
 *   elementni). Job holatni **o'zgartirmaydi**, faqat manba ma'lumotlarini (matn, metadata,
 *   R2 kalitlari) to'ldiradi — manba paneli to'liq matnni ko'rsatadi.
 * - `rejected`, `duplicate`, `scraped` — `item.fetch` / `item.extract` hech narsa yozmaydi.
 *
 * Tahlil job'lari (`item.dedupe`, `item.classify`, M2-03) matn ajratilgandan keyin ishlaydi:
 * `scraped` (va `pending` / `error`) elementga to'liq yozadi (`contentHash`, `clusterId`, `score`,
 * `suggestedCategory`, aniq dublikat uchun `status = duplicate`); `drafted` elementga faqat
 * klaster/score ma'lumotini — muharrir tanlagan kategoriya va holat o'zgarmaydi; `rejected`,
 * `duplicate` — hech narsa (`planAnalysisWrite`).
 *
 * Yozish — tranzaksiyada, element qatori `SELECT … FOR UPDATE` bilan qulflanadi (tahririyat
 * amallari ham shu qulfni oladi), shuning uchun "o'qish → muharrir oldi → job yozdi" poygasi
 * muharrir qarorini bosib keta olmaydi.
 */

type Id = number

/** Job holatni boshqaradigan holatlar. */
export const SCRAPE_OWNED_STATUSES = ['pending', 'error'] as const
/** Job matnni to'ldirishi mumkin bo'lgan holatlar (holatni emas). */
export const SCRAPE_ENRICHABLE_STATUSES = [...SCRAPE_OWNED_STATUSES, 'drafted'] as const

export function isScrapeOwned(status: string | null | undefined): boolean {
  return (SCRAPE_OWNED_STATUSES as readonly string[]).includes(status ?? '')
}

export function isScrapeEnrichable(status: string | null | undefined): boolean {
  return (SCRAPE_ENRICHABLE_STATUSES as readonly string[]).includes(status ?? '')
}

export type ScrapeWritePlan =
  | { kind: 'full'; data: Partial<ScrapedItem> }
  | { kind: 'content'; data: Partial<ScrapedItem> }
  | { kind: 'skip' }

/** Joriy holatga qarab job nimani yozishi mumkin (sof funksiya — unit testlar uchun). */
export function planScrapeWrite(
  status: string | null | undefined,
  data: Partial<ScrapedItem>,
): ScrapeWritePlan {
  if (isScrapeOwned(status)) return { kind: 'full', data }
  if (!isScrapeEnrichable(status)) return { kind: 'skip' }
  const { status: _status, error: _error, ...content } = data
  return Object.keys(content).length ? { kind: 'content', data: content } : { kind: 'skip' }
}

/** Tahlil job'lari (`item.dedupe`, `item.classify`) to'liq yozadigan holatlar. */
export const ANALYSIS_OWNED_STATUSES = ['pending', 'scraped', 'error'] as const
/** `drafted` elementga tahlil job'i faqat shu maydonlarni yozadi. */
const DRAFTED_ANALYSIS_FIELDS = ['contentHash', 'clusterId', 'score', 'fetchMeta'] as const

export function isAnalysisWritable(status: string | null | undefined): boolean {
  return (
    status === 'drafted' || (ANALYSIS_OWNED_STATUSES as readonly string[]).includes(status ?? '')
  )
}

/** Tahlil natijasini joriy holatga qarab filtrlash (sof funksiya — unit testlar uchun). */
export function planAnalysisWrite(
  status: string | null | undefined,
  data: Partial<ScrapedItem>,
): ScrapeWritePlan {
  if ((ANALYSIS_OWNED_STATUSES as readonly string[]).includes(status ?? '')) {
    // `duplicate` faqat to'liq yig'ilgan (`scraped`) elementga qo'yiladi.
    if (data.status && !(data.status === 'duplicate' && status === 'scraped')) {
      const { status: _status, ...rest } = data
      return Object.keys(rest).length ? { kind: 'full', data: rest } : { kind: 'skip' }
    }
    return { kind: 'full', data }
  }
  if (status !== 'drafted') return { kind: 'skip' }
  const content: Partial<ScrapedItem> = {}
  for (const key of DRAFTED_ANALYSIS_FIELDS) {
    if (key in data) (content as Record<string, unknown>)[key] = data[key]
  }
  return Object.keys(content).length ? { kind: 'content', data: content } : { kind: 'skip' }
}

/** Tranzaksiya ichidagi (bo'lsa) drizzle ulanishi — xom SQL uchun. */
export async function transactionDb(req: PayloadRequest) {
  const adapter = req.payload.db as unknown as PostgresAdapter
  const transactionID = req.transactionID ? await req.transactionID : undefined
  return (transactionID !== undefined && adapter.sessions?.[transactionID]?.db) || adapter.drizzle
}

/**
 * Element qatorini tranzaksiya oxirigacha qulflaydi. Qator bo'lmasa — `false`.
 * Postgres bo'lmagan adapterda (hozir yo'q) qulfsiz davom etiladi.
 */
export async function lockScrapedItem(req: PayloadRequest, id: Id): Promise<boolean> {
  const adapter = req.payload.db as unknown as Partial<PostgresAdapter>
  if (!adapter.drizzle) return true
  const db = await transactionDb(req)
  const result = await db.execute(
    sql`SELECT "id" FROM "scraped_items" WHERE "id" = ${id} FOR UPDATE`,
  )
  return result.rows.length > 0
}

/** Tranzaksiya ichida bajaradi: xato bo'lsa — rollback. */
export async function inTransaction<T>(req: PayloadRequest, fn: () => Promise<T>): Promise<T> {
  const shouldCommit = await initTransaction(req)
  try {
    const result = await fn()
    if (shouldCommit) await commitTransaction(req)
    return result
  } catch (error) {
    if (shouldCommit) await killTransaction(req)
    throw error
  }
}

export type ScrapeWriteResult = ScrapeWritePlan['kind']

/**
 * Job natijasini elementga yozadi — faqat element hali job'ga tegishli bo'lsa (yuqoriga qarang).
 * Qaytaradi: `full` — hammasi yozildi; `content` — holat saqlandi, faqat matn/metadata;
 * `skip` — hech narsa yozilmadi (element yo'q yoki muharrir hal qilgan).
 */
export async function writeScrapeResult(
  payload: Payload,
  id: Id,
  data: Partial<ScrapedItem>,
): Promise<ScrapeWriteResult> {
  const req = await createLocalReq({}, payload)
  return inTransaction(req, async () => {
    if (!(await lockScrapedItem(req, id))) return 'skip'
    const current = await payload.findByID({
      collection: 'scraped-items',
      id,
      depth: 0,
      req,
      disableErrors: true,
      select: { status: true },
    })
    const plan = planScrapeWrite(current?.status, data)
    if (plan.kind === 'skip') return 'skip'
    await payload.update({ collection: 'scraped-items', id, depth: 0, data: plan.data, req })
    return plan.kind
  })
}

/**
 * Qulflangan element ustida tahlil (`item.dedupe` / `item.classify`): tranzaksiya ochiladi,
 * qator `FOR UPDATE` bilan qulflanadi, joriy hujjat o'qiladi va `compute` natijasi
 * `planAnalysisWrite` bo'yicha yoziladi. `compute` `null` qaytarsa — hech narsa yozilmaydi.
 * `compute` ichida `req` bilan bajarilgan so'rovlar shu tranzaksiyada.
 */
export async function writeAnalysisResult<T>(
  payload: Payload,
  id: Id,
  compute: (ctx: {
    req: PayloadRequest
    item: ScrapedItem
  }) => Promise<{ data: Partial<ScrapedItem>; result: T } | null>,
): Promise<{ kind: ScrapeWriteResult; result: T | null }> {
  const req = await createLocalReq({}, payload)
  return inTransaction(req, async () => {
    if (!(await lockScrapedItem(req, id))) return { kind: 'skip' as const, result: null }
    const item = await payload.findByID({
      collection: 'scraped-items',
      id,
      depth: 0,
      req,
      disableErrors: true,
    })
    if (!item || !isAnalysisWritable(item.status)) return { kind: 'skip' as const, result: null }
    const computed = await compute({ req, item })
    if (!computed) return { kind: 'skip' as const, result: null }
    const plan = planAnalysisWrite(item.status, computed.data)
    if (plan.kind !== 'skip') {
      await payload.update({ collection: 'scraped-items', id, depth: 0, data: plan.data, req })
    }
    return { kind: plan.kind, result: computed.result }
  })
}
