import { APIError, type PayloadRequest } from 'payload'

import { isAdminOrEditorUser } from '@/access'
import { SLUG_MAX_LENGTH, toSlug } from '@/lib/slug'
import type { Post, ScrapedItem } from '@/payload-types'
import { inTransaction, lockScrapedItem } from '@/scraping/itemState'

/**
 * Tahririyat navbati amallari (TZ §4.1 `scraped → draft` / `scraped → rejected`, TASKS M2-04):
 *
 * - **Qoralamaga olish** — `posts` yaratadi (`workflowStatus = draft`, `sources[]` atributsiya,
 *   kategoriya, `assignee` = joriy foydalanuvchi), element `drafted` bo'ladi va `post` ga bog'lanadi.
 * - **Rad etish** — sabab majburiy, element `rejected` bo'ladi (navbatdan yo'qoladi).
 *
 * Ikkalasi ham bitta tranzaksiyada, element qatori `SELECT … FOR UPDATE` bilan qulflanadi —
 * bir vaqtda kelgan ikki so'rov ikkita post yaratmaydi (idempotent: allaqachon olingan element
 * uchun mavjud post qaytariladi). Faqat admin/editor (TZ §4.2); Local API `overrideAccess: false`.
 */

export class EditorialError extends APIError {
  constructor(message: string, status: 400 | 401 | 403 | 404 | 409) {
    super(message, status, null, true)
  }
}

export const REJECT_REASON_MAX_LENGTH = 1000

type Id = number

function relId(value: unknown): Id | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return ((value as { id?: Id }).id ?? null) as Id | null
  return value as Id
}

/** Faqat tizimga kirgan admin/editor (anonim — 401, boshqa rol — 403). */
export function assertEditor(req: PayloadRequest): Id {
  const user = req.user
  if (!user) throw new EditorialError('Tizimga kiring.', 401)
  if (!isAdminOrEditorUser(user)) {
    throw new EditorialError('Bu amal faqat admin va muharrirlar uchun.', 403)
  }
  return user.id as Id
}

async function loadItem(req: PayloadRequest, id: Id): Promise<ScrapedItem> {
  if (!(await lockScrapedItem(req, id))) {
    throw new EditorialError(`Element topilmadi (id: ${id}).`, 404)
  }
  const item = await req.payload.findByID({
    collection: 'scraped-items',
    id,
    depth: 1,
    req,
    overrideAccess: false,
    disableErrors: true,
  })
  if (!item) throw new EditorialError(`Element topilmadi (id: ${id}).`, 404)
  return item
}

export interface DraftPostInput {
  categoryId: Id
  userId: Id
  slug: string
}

/** Elementdan qoralama post ma'lumotlari (sof funksiya — unit testlar uchun). */
export function buildDraftPostData(item: ScrapedItem, input: DraftPostInput) {
  const source = typeof item.source === 'object' && item.source ? item.source : null
  const url = item.canonicalUrl?.trim() || item.url
  let name = source?.name?.trim()
  if (!name) {
    try {
      name = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      name = undefined
    }
  }
  return {
    // Ishchi sarlavha — asl sarlavha; muharrir o'zbekchaga qayta yozadi (TZ §5, qo'lda yo'l).
    title: item.title?.trim() || url,
    slug: input.slug,
    category: input.categoryId,
    workflowStatus: 'draft' as const,
    assignee: input.userId,
    rewrittenBy: 'human' as const,
    sources: [{ name: name ?? null, url, scrapedItem: item.id }],
    // TODO(M1-03): kirill (uz-Cyrl) versiyasi transliteratsiya hook'i bilan avtomatik yasaladi —
    // M1-03 (OBLOG-10) main'ga qo'shilgach shu yerda qo'shimcha ish kerak emas.
  }
}

/** Asl sarlavhadan slug; lotin harflari bo'lmasa (masalan, rus tili) — `yangilik-<id>`. */
export function baseSlugFor(item: Pick<ScrapedItem, 'id' | 'title'>): string {
  return toSlug(item.title ?? '') || `yangilik-${item.id}`
}

async function uniqueSlug(req: PayloadRequest, item: ScrapedItem): Promise<string> {
  const base = baseSlugFor(item)
  const taken = async (slug: string) =>
    (
      await req.payload.count({
        collection: 'posts',
        where: { slug: { equals: slug } },
        req,
      })
    ).totalDocs > 0
  if (!(await taken(base))) return base
  const suffix = `-${item.id}`
  const withId = `${base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/g, '')}${suffix}`
  if (!(await taken(withId))) return withId
  return `${withId.slice(0, SLUG_MAX_LENGTH - 14).replace(/-+$/g, '')}-${Date.now()}`
}

export interface TakeResult {
  post: Pick<Post, 'id' | 'title' | 'slug' | 'workflowStatus'>
  item: ScrapedItem
  /** `false` — element allaqachon olingan, mavjud post qaytarildi. */
  created: boolean
}

/** "Qoralamaga olish". `categoryId` berilmasa — `suggestedCategory`. */
export async function takeScrapedItem(
  req: PayloadRequest,
  args: { id: Id; categoryId?: Id | null },
): Promise<TakeResult> {
  const userId = assertEditor(req)
  return inTransaction(req, async () => {
    const item = await loadItem(req, args.id)
    if (item.status === 'rejected') {
      throw new EditorialError('Element rad etilgan — qoralamaga olib bo‘lmaydi.', 409)
    }

    const existingId = relId(item.post)
    if (existingId !== null) {
      const existing = await req.payload.findByID({
        collection: 'posts',
        id: existingId,
        depth: 0,
        draft: true,
        req,
        overrideAccess: false,
        disableErrors: true,
      })
      if (existing) {
        const pick = {
          id: existing.id,
          title: existing.title,
          slug: existing.slug,
          workflowStatus: existing.workflowStatus,
        }
        if (item.status === 'drafted') return { post: pick, item, created: false }
        // Post bor, lekin holat mos emas (masalan, qo'lda o'zgartirilgan) — tuzatamiz.
        const fixed = await req.payload.update({
          collection: 'scraped-items',
          id: item.id,
          data: { status: 'drafted' },
          depth: 1,
          req,
          overrideAccess: false,
        })
        return { post: pick, item: fixed, created: false }
      }
      // Post o'chirilgan — yangisini yaratamiz.
    }

    const categoryId = args.categoryId ?? relId(item.suggestedCategory)
    if (!categoryId) {
      throw new EditorialError(
        'Kategoriyani tanlang — elementda taklif qilingan kategoriya yo‘q.',
        400,
      )
    }

    const post = await req.payload.create({
      collection: 'posts',
      data: buildDraftPostData(item, {
        categoryId,
        userId,
        slug: await uniqueSlug(req, item),
      }),
      draft: true,
      depth: 0,
      req,
      overrideAccess: false,
    })

    const updated = await req.payload.update({
      collection: 'scraped-items',
      id: item.id,
      data: {
        status: 'drafted',
        post: post.id,
        handledBy: userId,
        handledAt: new Date().toISOString(),
        rejectReason: null,
      },
      depth: 1,
      req,
      overrideAccess: false,
    })

    return {
      post: {
        id: post.id,
        title: post.title,
        slug: post.slug,
        workflowStatus: post.workflowStatus,
      },
      item: updated,
      created: true,
    }
  })
}

export interface TakeManyResult {
  post: TakeResult['post']
  items: ScrapedItem[]
  /** `false` — asosiy element allaqachon olingan, mavjud post qaytarildi. */
  created: boolean
}

/** Elementlar atributsiyasi (URL bo'yicha takrorlanmas) — `sources[]`. */
export function buildSources(items: ScrapedItem[]): NonNullable<Post['sources']> {
  const seen = new Set<string>()
  const sources: NonNullable<Post['sources']> = []
  for (const item of items) {
    const [source] = buildDraftPostData(item, { categoryId: 0, userId: 0, slug: '' }).sources
    if (!source || seen.has(source.url)) continue
    seen.add(source.url)
    sources.push(source)
  }
  return sources
}

/**
 * Bir nechta elementdan (masalan, bitta klaster) bitta qoralama — MCP `create_draft` (M2-07).
 * Birinchi element — asosiy (sarlavha, slug, kategoriya); qolganlari `sources[]` ga qo'shiladi.
 * Hammasi bitta tranzaksiyada, elementlar ID tartibida qulflanadi (deadlock bo'lmasin).
 *
 * - Asosiy element allaqachon olingan bo'lsa — mavjud post qaytariladi (idempotent), qolgan
 *   elementlar hali hech qaysi postga bog'lanmagan bo'lsa, shu postga qo'shiladi.
 * - Rad etilgan yoki boshqa postga bog'langan qo'shimcha element — 409.
 */
export async function takeScrapedItems(
  req: PayloadRequest,
  args: { ids: Id[]; categoryId?: Id | null },
): Promise<TakeManyResult> {
  const userId = assertEditor(req)
  const ids = [...new Set(args.ids)]
  const primaryId = ids[0]
  if (primaryId === undefined) throw new EditorialError('Kamida bitta element ID kerak.', 400)

  return inTransaction(req, async () => {
    const byId = new Map<Id, ScrapedItem>()
    for (const id of [...ids].sort((a, b) => a - b)) byId.set(id, await loadItem(req, id))
    const items = ids.map((id) => byId.get(id) as ScrapedItem)
    const primary = items[0] as ScrapedItem

    for (const item of items) {
      if (item.status === 'rejected') {
        throw new EditorialError(
          `Element #${item.id} rad etilgan — qoralamaga olib bo'lmaydi.`,
          409,
        )
      }
    }

    // Asosiy element allaqachon qoralamaga olinganmi (post mavjud)?
    let post: Post | null = null
    const existingId = relId(primary.post)
    if (existingId !== null) {
      post = await req.payload.findByID({
        collection: 'posts',
        id: existingId,
        depth: 0,
        draft: true,
        req,
        overrideAccess: false,
        disableErrors: true,
      })
    }
    for (const item of items.slice(1)) {
      const linked = relId(item.post)
      if (linked !== null && linked !== post?.id) {
        throw new EditorialError(
          `Element #${item.id} allaqachon boshqa qoralamaga (post #${linked}) olingan.`,
          409,
        )
      }
    }

    const created = post === null
    if (!post) {
      const categoryId =
        args.categoryId ??
        items.map((item) => relId(item.suggestedCategory)).find((id) => id !== null) ??
        null
      if (!categoryId) {
        throw new EditorialError(
          "Kategoriyani tanlang — elementlarda taklif qilingan kategoriya yo'q.",
          400,
        )
      }
      post = await req.payload.create({
        collection: 'posts',
        data: {
          ...buildDraftPostData(primary, {
            categoryId,
            userId,
            slug: await uniqueSlug(req, primary),
          }),
          sources: buildSources(items),
        },
        draft: true,
        depth: 0,
        req,
        overrideAccess: false,
      })
    } else {
      const known = new Set((post.sources ?? []).map((source) => source.url))
      const extra = buildSources(items).filter((source) => !known.has(source.url))
      if (extra.length && !['draft', 'in_progress'].includes(post.workflowStatus)) {
        throw new EditorialError(
          `Element #${primary.id} ning posti (#${post.id}) "${post.workflowStatus}" holatida — ` +
            "unga yangi manba qo'shib bo'lmaydi.",
          409,
        )
      }
      if (extra.length) {
        post = await req.payload.update({
          collection: 'posts',
          id: post.id,
          data: {
            sources: [
              ...(post.sources ?? []).map((source) => ({
                name: source.name ?? null,
                url: source.url,
                scrapedItem: relId(source.scrapedItem),
              })),
              ...extra,
            ],
          },
          depth: 0,
          req,
          overrideAccess: false,
        })
      }
    }

    const postId = post.id
    const updated: ScrapedItem[] = []
    for (const item of items) {
      if (item.status === 'drafted' && relId(item.post) === postId) {
        updated.push(item)
        continue
      }
      updated.push(
        await req.payload.update({
          collection: 'scraped-items',
          id: item.id,
          data: {
            status: 'drafted',
            post: postId,
            handledBy: userId,
            handledAt: new Date().toISOString(),
            rejectReason: null,
          },
          depth: 0,
          req,
          overrideAccess: false,
        }),
      )
    }

    return {
      post: {
        id: post.id,
        title: post.title,
        slug: post.slug,
        workflowStatus: post.workflowStatus,
      },
      items: updated,
      created,
    }
  })
}

export interface RejectResult {
  item: ScrapedItem
  /** `false` — element allaqachon rad etilgan edi. */
  changed: boolean
}

/** "Rad etish" — sabab majburiy (TZ §4.1). */
export async function rejectScrapedItem(
  req: PayloadRequest,
  args: { id: Id; reason: unknown },
): Promise<RejectResult> {
  const userId = assertEditor(req)
  const reason = typeof args.reason === 'string' ? args.reason.trim() : ''
  if (!reason) throw new EditorialError('Rad etish sababi majburiy.', 400)
  if (reason.length > REJECT_REASON_MAX_LENGTH) {
    throw new EditorialError(
      `Rad etish sababi ${REJECT_REASON_MAX_LENGTH} belgidan oshmasligi kerak.`,
      400,
    )
  }

  return inTransaction(req, async () => {
    const item = await loadItem(req, args.id)
    if (item.status === 'rejected') return { item, changed: false }
    if (item.status === 'drafted') {
      throw new EditorialError(
        'Element allaqachon qoralamaga olingan — kerak bo‘lsa postni rad eting.',
        409,
      )
    }
    const updated = await req.payload.update({
      collection: 'scraped-items',
      id: item.id,
      data: {
        status: 'rejected',
        rejectReason: reason,
        handledBy: userId,
        handledAt: new Date().toISOString(),
      },
      depth: 1,
      req,
      overrideAccess: false,
    })
    return { item: updated, changed: true }
  })
}
