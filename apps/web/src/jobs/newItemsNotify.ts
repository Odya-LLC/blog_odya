import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { escapeTelegramHtml, sendTelegramMessage, TELEGRAM_TIMEOUT_MS } from '@/lib/telegram'
import { siteOrigin } from '@/site/seo/config'
import { loadTelegramConfig } from '@/telegram/config'

import { claimNewItemsWindow, readScrapingStats } from './stats'

/**
 * "Yangi yangiliklar" xabari (OBLOG-55): scheduler tick'idan keyin (`/api/jobs/run` job'lardan
 * keyin; `autorun` da — `shouldAutoRun` ichida) admin ogohlantirish chatiga
 * (`telegram-settings.alertChatId`, bo'lmasa env `TELEGRAM_ALERT_CHAT_ID`) qisqa xabar: nechta
 * yangi yangilik yig'ildi, manbalar va (bo'lsa) rubrikalar bo'yicha, navbatga havola.
 *
 * - "Yangi" — oyna ichida (`stats.newItems.watermark` < `createdAt` ≤ hozir) yaratilgan
 *   `scraped-items`, `duplicate`/`rejected` holatidagilardan tashqari. `feed.poll` elementlarni
 *   `pending` holatida yaratadi; dedupe (`item.dedupe`) shu tick'da ulgurgan bo'lsa takrorlar
 *   chiqariladi, ulgurmaganlari (`pending`) hisobga kiradi.
 * - Tick'da bitta xabar: `feed.poll` har manba uchun alohida job bo'lsa ham, xabar job'lardan
 *   keyin bitta so'rov bilan yig'iladi. Parallel chaqiruvlar — `claimNewItemsWindow` (CAS),
 *   oyna faqat bir marta yuboriladi.
 * - Sozlamalar: `telegram-settings.notifyNewItems` (o'chiq — xabar yo'q) va `newItemsMinCount`
 *   (kam bo'lsa oyna siljimaydi — keyingi tick'larda yig'iladi). Oyna eng ko'pi
 *   `NEW_ITEMS_MAX_LOOKBACK_MS` orqaga (birinchi ishga tushish / uzoq tanaffus).
 * - Token/chat sozlanmagan — jim o'tkaziladi (debug log). Telegram xatosi hech narsani
 *   yiqitmaydi: log, oyna esa siljigan bo'ladi (takror xabar yo'q).
 */

export const NEW_ITEMS_MAX_LOOKBACK_MS = 3 * 60 * 60_000
/** Xabardagi manba/rubrika qatorlari chegarasi (qolgani — "+N boshqa"). */
export const NEW_ITEMS_MAX_SOURCES = 8
export const NEW_ITEMS_MAX_CATEGORIES = 3
export const NEWS_QUEUE_PATH = '/admin/news-queue'

export interface CountRow {
  name: string
  count: number
}

export interface NewItemsSummary {
  total: number
  sources: CountRow[]
  categories: CountRow[]
}

export interface NewItemsNotifySettings {
  enabled: boolean
  minCount: number
}

export function resolveNewItemsSettings(
  settings:
    { notifyNewItems?: boolean | null; newItemsMinCount?: number | null } | null | undefined,
): NewItemsNotifySettings {
  const min = settings?.newItemsMinCount
  return {
    enabled: settings?.notifyNewItems !== false,
    minCount: typeof min === 'number' && Number.isFinite(min) ? Math.max(1, Math.round(min)) : 1,
  }
}

function byCount(rows: CountRow[]): CountRow[] {
  return [...rows].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** Xabar matni (HTML, `parse_mode: HTML`): nomlar ekranlanadi, qatorlar soni cheklangan. */
export function formatNewItemsMessage(
  summary: NewItemsSummary,
  options: { adminUrl: string; maxSources?: number; maxCategories?: number },
): string {
  const maxSources = options.maxSources ?? NEW_ITEMS_MAX_SOURCES
  const maxCategories = options.maxCategories ?? NEW_ITEMS_MAX_CATEGORIES
  const lines = [`🆕 <b>Yangi yangiliklar: ${summary.total} ta</b>`]

  const sources = byCount(summary.sources)
  const shown = sources.length > maxSources ? sources.slice(0, maxSources - 1) : sources
  for (const row of shown) lines.push(`• ${escapeTelegramHtml(row.name)} — ${row.count}`)
  const rest = sources.slice(shown.length)
  if (rest.length) {
    const count = rest.reduce((sum, row) => sum + row.count, 0)
    lines.push(`• +${rest.length} boshqa — ${count}`)
  }

  const categories = byCount(summary.categories).slice(0, maxCategories)
  if (categories.length) {
    lines.push(
      `Rubrikalar: ${categories.map((row) => `${escapeTelegramHtml(row.name)} (${row.count})`).join(', ')}`,
    )
  }
  lines.push(`<a href="${escapeTelegramHtml(options.adminUrl)}">Navbatni ochish</a>`)
  return lines.join('\n')
}

type Rows<T> = { rows: T[] }

function drizzle(payload: Payload) {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

/** Oyna (`since`, `until`] ichida yaratilgan, takror/rad etilmagan elementlar. */
export async function collectNewItems(
  payload: Payload,
  window: { since: string; until: string },
): Promise<NewItemsSummary> {
  const { rows } = (await drizzle(payload).execute(sql`
    SELECT i."source_id" AS "sourceId", s."name" AS "name",
      i."suggested_category_id" AS "categoryId", count(*)::int AS "count"
    FROM "scraped_items" i
    LEFT JOIN "sources" s ON s."id" = i."source_id"
    WHERE i."created_at" > ${window.since}::timestamptz
      AND i."created_at" <= ${window.until}::timestamptz
      AND i."status" NOT IN ('duplicate', 'rejected')
    GROUP BY i."source_id", s."name", i."suggested_category_id"
  `)) as unknown as Rows<{
    sourceId: number | null
    name: string | null
    categoryId: number | null
    count: number
  }>

  const sources = new Map<string, number>()
  const categories = new Map<number, number>()
  let total = 0
  for (const row of rows) {
    const count = Number(row.count)
    total += count
    const name = row.name ?? 'Manbasiz'
    sources.set(name, (sources.get(name) ?? 0) + count)
    if (row.categoryId != null) {
      categories.set(row.categoryId, (categories.get(row.categoryId) ?? 0) + count)
    }
  }

  let categoryRows: CountRow[] = []
  if (categories.size) {
    const { docs } = await payload.find({
      collection: 'categories',
      where: { id: { in: [...categories.keys()] } },
      select: { name: true },
      locale: 'uz-Latn',
      depth: 0,
      pagination: false,
      limit: 0,
    })
    categoryRows = docs
      .filter((doc) => doc.name)
      .map((doc) => ({ name: doc.name, count: categories.get(doc.id) ?? 0 }))
  }

  return {
    total,
    sources: [...sources].map(([name, count]) => ({ name, count })),
    categories: categoryRows,
  }
}

export type NewItemsNotifyStatus =
  | 'sent'
  | 'none'
  | 'below-threshold'
  | 'disabled'
  | 'not-configured'
  | 'claimed-elsewhere'
  | 'failed'

export interface NewItemsNotifyResult {
  status: NewItemsNotifyStatus
  count: number
}

export interface NewItemsNotifyDeps {
  now: () => number
  fetchImpl?: typeof fetch
  origin: () => string
}

export const newItemsNotifyDeps: NewItemsNotifyDeps = {
  now: () => Date.now(),
  origin: () => siteOrigin(),
}

async function readNotifySettings(payload: Payload): Promise<NewItemsNotifySettings> {
  try {
    const settings = await payload.findGlobal({ slug: 'telegram-settings', depth: 0 })
    return resolveNewItemsSettings(settings)
  } catch {
    return resolveNewItemsSettings(null)
  }
}

/**
 * Oynani tekshiradi va kerak bo'lsa xabar yuboradi. Hech qachon otilmaydi — xatolar log'ga.
 * `timeoutMs` — Telegram so'rovi uchun (endpoint'ning qolgan vaqti).
 */
export async function runNewItemsNotification(
  payload: Payload,
  options: { timeoutMs?: number; deps?: NewItemsNotifyDeps } = {},
): Promise<NewItemsNotifyResult> {
  const deps = options.deps ?? newItemsNotifyDeps
  try {
    const settings = await readNotifySettings(payload)
    if (!settings.enabled) return { status: 'disabled', count: 0 }
    const config = await loadTelegramConfig(payload)
    if (!config.token || !config.alertChatId) {
      payload.logger.debug({ msg: 'Yangi yangiliklar xabari: Telegram token/alert chat yo‘q' })
      return { status: 'not-configured', count: 0 }
    }

    const now = deps.now()
    const until = new Date(now).toISOString()
    const previous = (await readScrapingStats(payload)).newItems?.watermark ?? null
    const floor = now - NEW_ITEMS_MAX_LOOKBACK_MS
    const previousTime = previous ? Date.parse(previous) : Number.NaN
    const since = new Date(
      Number.isNaN(previousTime) ? floor : Math.max(previousTime, floor),
    ).toISOString()

    const summary = await collectNewItems(payload, { since, until })
    if (summary.total === 0) return { status: 'none', count: 0 }
    if (summary.total < settings.minCount) {
      return { status: 'below-threshold', count: summary.total }
    }
    const claimed = await claimNewItemsWindow(payload, previous, {
      watermark: until,
      lastSentAt: until,
      lastCount: summary.total,
    })
    if (!claimed) return { status: 'claimed-elsewhere', count: summary.total }

    try {
      await sendTelegramMessage({
        token: config.token,
        chatId: config.alertChatId,
        text: formatNewItemsMessage(summary, { adminUrl: `${deps.origin()}${NEWS_QUEUE_PATH}` }),
        timeoutMs: Math.min(options.timeoutMs ?? TELEGRAM_TIMEOUT_MS, TELEGRAM_TIMEOUT_MS),
        fetchImpl: deps.fetchImpl,
      })
      return { status: 'sent', count: summary.total }
    } catch (error) {
      payload.logger.error({
        msg: `Yangi yangiliklar xabari yuborilmadi (${summary.total} ta)`,
        error: (error as Error).message,
      })
      return { status: 'failed', count: summary.total }
    }
  } catch (error) {
    payload.logger.error({ err: error, msg: 'Yangi yangiliklar xabarini tayyorlab bo‘lmadi' })
    return { status: 'failed', count: 0 }
  }
}
