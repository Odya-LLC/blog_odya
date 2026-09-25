import type { Where } from 'payload'

import type { ScrapedItemStatus } from '@/collections/ScrapedItems'
import { SITE_TIME_ZONE } from '@/lib/format'

/**
 * Tahririyat navbati (TZ §6.1 "Qoralamalar navbati", TASKS M2-04) — sof yordamchilar:
 * sana oralig'i (Toshkent vaqti), filtrlar, saralash va klaster bo'yicha guruhlash.
 * Server view (`components/admin/NewsQueueView.tsx`) va testlar shularni ishlatadi.
 */

/** Toshkent — UTC+5, yozgi vaqt yo'q (2011 dan beri), shuning uchun siljish doimiy. */
const TASHKENT_OFFSET = '+05:00'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** `now` ning Toshkent vaqtidagi sanasi — `YYYY-MM-DD`. */
export function localDate(now: Date = new Date()): string {
  // `en-CA` — ISO ko'rinishidagi sana (YYYY-MM-DD).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const time = new Date(`${value}T00:00:00${TASHKENT_OFFSET}`).getTime()
  return !Number.isNaN(time) && localDate(new Date(time)) === value
}

/** Toshkent kuni `[from, to)` — ISO (UTC) ko'rinishida. */
export function dayRange(date: string): { from: string; to: string } {
  const start = new Date(`${date}T00:00:00${TASHKENT_OFFSET}`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { from: start.toISOString(), to: end.toISOString() }
}

/**
 * Holat filtri: `new` — ko'rib chiqilmaganlar (navbatning o'zi: `pending` + `scraped`), `all` —
 * hammasi, qolganlari — aniq holat. Rad etilgan va qoralamaga olingan elementlar `new` da ko'rinmaydi.
 */
export const QUEUE_STATUS_FILTERS = [
  'new',
  'drafted',
  'rejected',
  'duplicate',
  'error',
  'all',
] as const

export type QueueStatusFilter = (typeof QUEUE_STATUS_FILTERS)[number]

export const QUEUE_STATUS_FILTER_LABELS: Record<QueueStatusFilter, string> = {
  new: 'Yangi (ko‘rib chiqilmagan)',
  drafted: 'Qoralamaga olingan',
  rejected: 'Rad etilgan',
  duplicate: 'Dublikat',
  error: 'Xato',
  all: 'Hammasi',
}

/** Navbatda ko'rinadigan ("yangi") holatlar. */
export const OPEN_STATUSES: readonly ScrapedItemStatus[] = ['pending', 'scraped']

export interface QueueFilters {
  date: string
  status: QueueStatusFilter
  source?: number
  category?: number
}

type SearchParams = Record<string, string | string[] | undefined> | undefined

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function positiveInt(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : undefined
}

/** URL `searchParams` → filtrlar (noto'g'ri qiymatlar e'tiborsiz — default ishlatiladi). */
export function parseQueueFilters(
  searchParams: SearchParams,
  now: Date = new Date(),
): QueueFilters {
  const date = first(searchParams?.date)
  const status = first(searchParams?.status)
  return {
    date: isValidDate(date) ? date : localDate(now),
    status: (QUEUE_STATUS_FILTERS as readonly string[]).includes(status ?? '')
      ? (status as QueueStatusFilter)
      : 'new',
    source: positiveInt(first(searchParams?.source)),
    category: positiveInt(first(searchParams?.category)),
  }
}

/** `scraped-items` so'rovi: tanlangan kun (yig'ilgan vaqt — `createdAt`) + filtrlar. */
export function buildQueueWhere(filters: QueueFilters): Where {
  const { from, to } = dayRange(filters.date)
  const and: Where[] = [
    { createdAt: { greater_than_equal: from } },
    { createdAt: { less_than: to } },
  ]
  if (filters.status === 'new') and.push({ status: { in: [...OPEN_STATUSES] } })
  else if (filters.status !== 'all') and.push({ status: { equals: filters.status } })
  if (filters.source) and.push({ source: { equals: filters.source } })
  if (filters.category) and.push({ suggestedCategory: { equals: filters.category } })
  return { and }
}

export interface QueueItemLike {
  id: number
  score?: number | null
  clusterId?: string | null
  publishedAt?: string | null
  createdAt: string
}

function time(value: string | null | undefined): number {
  const t = value ? new Date(value).getTime() : NaN
  return Number.isNaN(t) ? 0 : t
}

/**
 * Saralash: score kamayish tartibida (score yo'q — oxirida), keyin manbada chop etilgan (yoki
 * yig'ilgan) vaqt — yangilari birinchi. Score hali hisoblanmagan bo'lsa (M2-03 gacha) navbat
 * shunchaki eng yangi yangiliklar tartibida bo'ladi.
 */
export function compareQueueItems(a: QueueItemLike, b: QueueItemLike): number {
  const sa = typeof a.score === 'number' ? a.score : -1
  const sb = typeof b.score === 'number' ? b.score : -1
  if (sa !== sb) return sb - sa
  const ta = time(a.publishedAt) || time(a.createdAt)
  const tb = time(b.publishedAt) || time(b.createdAt)
  if (ta !== tb) return tb - ta
  return b.id - a.id
}

export interface QueueGroup<T extends QueueItemLike> {
  /** `clusterId` yoki klastersiz element uchun `item-<id>`. */
  key: string
  clusterId: string | null
  items: T[]
}

/**
 * Klaster bo'yicha guruhlash (TZ §3.5 `item.dedupe`): bir xil `clusterId` — bitta guruh, eng
 * yaxshi element birinchi. `clusterId` bo'lmasa (M2-03 gacha) — har element alohida guruh.
 * Guruhlar tartibi — har guruhning birinchi (eng yaxshi) elementi bo'yicha.
 */
export function groupByCluster<T extends QueueItemLike>(items: readonly T[]): QueueGroup<T>[] {
  const sorted = [...items].sort(compareQueueItems)
  const groups = new Map<string, QueueGroup<T>>()
  for (const item of sorted) {
    const clusterId = item.clusterId?.trim() || null
    const key = clusterId ? `cluster-${clusterId}` : `item-${item.id}`
    const group = groups.get(key)
    if (group) group.items.push(item)
    else groups.set(key, { key, clusterId, items: [item] })
  }
  // Map kiritish tartibini saqlaydi — birinchi element bo'yicha allaqachon saralangan.
  return [...groups.values()]
}

/** Score va klaster hali hisoblanmaganmi (M2-03 gacha) — view'da izoh ko'rsatish uchun. */
export function scoringStatus(items: readonly QueueItemLike[]): {
  hasScore: boolean
  hasClusters: boolean
} {
  return {
    hasScore: items.some((item) => typeof item.score === 'number'),
    hasClusters: items.some((item) => Boolean(item.clusterId?.trim())),
  }
}

/**
 * Sahifalash (OBLOG-40): navbat klaster guruhlari bo'yicha sahifalanadi — bitta klaster hech
 * qachon ikki sahifaga bo'linmaydi. `limit` — sahifadagi guruhlar soni.
 */
export const QUEUE_PAGE_SIZES = [10, 25, 50, 100] as const
export const DEFAULT_QUEUE_PAGE_SIZE = 25

export interface QueuePagination {
  page: number
  limit: number
}

/** URL `searchParams` → `page` / `limit` (noto'g'ri qiymatlar — default). */
export function parseQueuePagination(searchParams: SearchParams): QueuePagination {
  const limit = positiveInt(first(searchParams?.limit))
  return {
    page: positiveInt(first(searchParams?.page)) ?? 1,
    limit:
      limit && (QUEUE_PAGE_SIZES as readonly number[]).includes(limit)
        ? limit
        : DEFAULT_QUEUE_PAGE_SIZE,
  }
}

export interface QueuePageInfo {
  /** Joriy sahifa (1..totalPages oralig'iga keltirilgan). */
  page: number
  limit: number
  totalPages: number
  totalGroups: number
  hasPrevPage: boolean
  hasNextPage: boolean
  prevPage: number | null
  nextPage: number | null
}

/** Guruhlar ro'yxatidan bitta sahifa. Sahifa raqami chegaradan chiqsa — oxirgi (yoki 1-) sahifa. */
export function paginateGroups<T>(
  groups: readonly T[],
  { page, limit }: QueuePagination,
): { groups: T[]; info: QueuePageInfo } {
  const size = Math.max(1, Math.floor(limit))
  const totalGroups = groups.length
  const totalPages = Math.max(1, Math.ceil(totalGroups / size))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages)
  const start = (current - 1) * size
  return {
    groups: groups.slice(start, start + size),
    info: {
      page: current,
      limit: size,
      totalPages,
      totalGroups,
      hasPrevPage: current > 1,
      hasNextPage: current < totalPages,
      prevPage: current > 1 ? current - 1 : null,
      nextPage: current < totalPages ? current + 1 : null,
    },
  }
}

/**
 * Navbat URL query'si: filtrlar + sahifalash. `page` = 1 va default `limit` yozilmaydi (URL
 * qisqa qoladi). Filtr o'zgarsa chaqiruvchi `page` ni bermaydi — 1-sahifaga qaytiladi.
 */
export function queueSearchParams(
  filters: QueueFilters,
  pagination: Partial<QueuePagination> = {},
): URLSearchParams {
  const params = new URLSearchParams({ date: filters.date, status: filters.status })
  if (filters.source) params.set('source', String(filters.source))
  if (filters.category) params.set('category', String(filters.category))
  if (pagination.limit && pagination.limit !== DEFAULT_QUEUE_PAGE_SIZE) {
    params.set('limit', String(pagination.limit))
  }
  if (pagination.page && pagination.page > 1) params.set('page', String(pagination.page))
  return params
}
