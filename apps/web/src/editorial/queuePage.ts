import { Forbidden, type PayloadRequest } from 'payload'

import { isAdminOrEditorUser } from '@/access'
import { SCRAPED_ITEM_STATUSES, type ScrapedItemStatus } from '@/collections/ScrapedItems'
import { snippet } from '@/components/admin/utils'
import type { ScrapedItem } from '@/payload-types'

import {
  buildQueueWhere,
  groupByCluster,
  paginateGroups,
  type QueueFilters,
  type QueueGroup,
  type QueuePageInfo,
  type QueuePagination,
  scoringStatus,
} from './queue'

/**
 * Tahririyat navbati sahifasi uchun ma'lumot (OBLOG-40). Avval navbat 500 tagacha elementni
 * to'liq matni (`extractedText`) va `depth: 1` bilan `payload.find` orqali olib, hammasini bitta
 * sahifada render qilardi (4 000 elementli kunda ~4 s, ~2 MB HTML). Endi:
 *
 * 1. Kun + filtrlar bo'yicha barcha elementlar — faqat saralash/guruhlash maydonlari, DB adapteri
 *    orqali (`payload.find` ning afterRead pipeline'i minglab hujjatda sekundlab vaqt olardi).
 * 2. Klaster guruhlari → bitta sahifa (`paginateGroups`).
 * 3. Faqat shu sahifadagi elementlar uchun ko'rsatiladigan maydonlar (`depth: 0`, `id in`).
 * 4. Manba/kategoriya nomlari — filtr ro'yxatlaridan; post sarlavhalari — bitta `id in` so'rov.
 */

/** Yengil so'rov chegarasi — bir kun uchun amalda yetib bo'lmaydigan zaxira. */
export const QUEUE_SCAN_LIMIT = 5000

export interface QueueRowItem {
  id: number
  title: string | null
  url: string
  status: ScrapedItemStatus
  score: number | null
  clusterId: string | null
  publishedAt: string | null
  createdAt: string
  language: string | null
  /** To'liq matn (yoki RSS description) dan qisqa parcha — to'liq matn klientga yuborilmaydi. */
  text: string
  wordCount: number | null
  rejectReason: string | null
  source: { id: number; name: string | null } | null
  suggestedCategory: { id: number; name: string | null } | null
  post: { id: number; title: string | null } | null
}

export interface QueueOption {
  id: number
  name: string
}

export interface QueuePageData {
  /** Filtrlarga mos elementlar soni (kun bo'yicha). */
  totalDocs: number
  /** `totalDocs` > `QUEUE_SCAN_LIMIT` — eng eski elementlar sahifalarga kirmadi. */
  truncated: boolean
  groups: QueueGroup<QueueRowItem>[]
  pageInfo: QueuePageInfo
  hasScore: boolean
  hasClusters: boolean
  sources: QueueOption[]
  categories: QueueOption[]
}

/** Yengil so'rov natijasi — faqat saralash/guruhlash uchun. */
type LightItem = Pick<ScrapedItem, 'id' | 'score' | 'clusterId' | 'publishedAt' | 'createdAt'>

function relationId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return typeof id === 'number' ? id : null
  }
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

function nameOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export async function loadQueuePage({
  req,
  filters,
  pagination,
  scanLimit = QUEUE_SCAN_LIMIT,
}: {
  req: PayloadRequest
  filters: QueueFilters
  pagination: QueuePagination
  scanLimit?: number
}): Promise<QueuePageData> {
  const { payload } = req
  // Yengil so'rov DB adapteri orqali (Payload afterRead pipeline'isiz — minglab hujjatda u
  // sekundlab vaqt oladi). Shuning uchun kolleksiya read access'i (`isAdminOrEditor`, where-
  // shartsiz) shu yerda qo'lda tekshiriladi; qolgan so'rovlar oddiy `overrideAccess: false`.
  if (!isAdminOrEditorUser(req.user)) throw new Forbidden(req.t)
  const access = { overrideAccess: false, req } as const

  const [light, sources, categories] = await Promise.all([
    payload.db.find<LightItem>({
      collection: 'scraped-items',
      where: buildQueueWhere(filters),
      sort: '-createdAt',
      limit: scanLimit,
      pagination: true,
      select: { score: true, clusterId: true, publishedAt: true, createdAt: true },
      req,
    }),
    payload.find({
      collection: 'sources',
      sort: 'name',
      limit: 100,
      depth: 0,
      select: { name: true },
      ...access,
    }),
    payload.find({
      collection: 'categories',
      sort: 'name',
      limit: 200,
      depth: 0,
      select: { name: true },
      ...access,
    }),
  ])

  const { hasScore, hasClusters } = scoringStatus(light.docs)
  const { groups: pageGroups, info } = paginateGroups(groupByCluster(light.docs), pagination)
  const ids = pageGroups.flatMap((group) => group.items.map((item) => item.id))

  const sourceOptions = sources.docs.map((s) => ({ id: s.id, name: nameOf(s.name) }))
  const categoryOptions = categories.docs.map((c) => ({ id: c.id, name: nameOf(c.name) }))

  const details =
    ids.length === 0
      ? []
      : (
          await payload.find({
            collection: 'scraped-items',
            where: { id: { in: ids } },
            limit: ids.length,
            pagination: false,
            depth: 0,
            select: {
              title: true,
              url: true,
              canonicalUrl: true,
              source: true,
              status: true,
              score: true,
              clusterId: true,
              publishedAt: true,
              language: true,
              excerpt: true,
              extractedText: true,
              wordCount: true,
              suggestedCategory: true,
              post: true,
              rejectReason: true,
              createdAt: true,
            },
            ...access,
          })
        ).docs

  const postIds = [
    ...new Set(details.map((d) => relationId(d.post)).filter((id): id is number => id !== null)),
  ]
  const posts =
    postIds.length === 0
      ? []
      : (
          await payload.find({
            collection: 'posts',
            where: { id: { in: postIds } },
            limit: postIds.length,
            pagination: false,
            depth: 0,
            select: { title: true },
            ...access,
          })
        ).docs

  const sourceNames = new Map(sourceOptions.map((s) => [s.id, s.name]))
  const categoryNames = new Map(categoryOptions.map((c) => [c.id, c.name]))
  const postTitles = new Map(posts.map((p) => [p.id, nameOf(p.title)]))

  const rows = new Map<number, QueueRowItem>()
  for (const doc of details) {
    const sourceId = relationId(doc.source)
    const categoryId = relationId(doc.suggestedCategory)
    const postId = relationId(doc.post)
    rows.set(doc.id, {
      id: doc.id,
      title: doc.title ?? null,
      url: doc.canonicalUrl || doc.url,
      status: (SCRAPED_ITEM_STATUSES as readonly string[]).includes(doc.status)
        ? doc.status
        : 'pending',
      score: typeof doc.score === 'number' ? doc.score : null,
      clusterId: doc.clusterId ?? null,
      publishedAt: doc.publishedAt ?? null,
      createdAt: doc.createdAt,
      language: doc.language ?? null,
      text: snippet(doc.extractedText || doc.excerpt),
      wordCount: typeof doc.wordCount === 'number' ? doc.wordCount : null,
      rejectReason: doc.rejectReason ?? null,
      source: sourceId ? { id: sourceId, name: sourceNames.get(sourceId) || null } : null,
      suggestedCategory: categoryId
        ? { id: categoryId, name: categoryNames.get(categoryId) || null }
        : null,
      post: postId ? { id: postId, title: postTitles.get(postId) || null } : null,
    })
  }

  // Tartib yengil so'rovdagi guruhlashdan olinadi; oraliqda o'chirilgan elementlar tushib qoladi.
  const groups = pageGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => rows.get(item.id))
        .filter((row): row is QueueRowItem => Boolean(row)),
    }))
    .filter((group) => group.items.length > 0)

  return {
    totalDocs: light.totalDocs,
    truncated: light.totalDocs > light.docs.length,
    groups,
    pageInfo: info,
    hasScore,
    hasClusters,
    sources: sourceOptions,
    categories: categoryOptions,
  }
}
