import type { PayloadRequest, Where } from 'payload'

import { writeAuditLog } from '@/audit/hooks'
import type { Post } from '@/payload-types'
import { inTransaction } from '@/scraping/itemState'
import { lockPostRow } from '@/telegram/autopost'

import { assertEditor, EditorialError, REJECT_REASON_MAX_LENGTH } from './actions'
import { type RevisionChange, summarizeRevision } from './revisionDiff'

/**
 * Chop etilgan postlardagi kutilayotgan o'zgarishlar (OBLOG-64).
 *
 * Admin MCP kaliti chop etilgan postni tuzatsa (OBLOG-62), o'zgarishlar Payload qoralama
 * versiyasiga yoziladi; `submit_for_review` uni chop etmasa (avtomatik nashr o'chiq yoki ushlab
 * qolish sababi bor) — versiyaga **belgi** qo'yiladi: `revisionSubmittedAt` / `revisionSubmittedBy`.
 * Belgi faqat versiyada yashaydi (asosiy hujjat — saytdagi holat — o'zgarmaydi), shuning uchun:
 *
 * - navbat — `draft: true` so'rovi (oxirgi versiya): `workflowStatus = published`,
 *   `_status = draft`, `revisionSubmittedAt` bor. Muharrir admin'da autosave qilsa ham belgi
 *   saqlanadi (`keepRevisionMarker`), oddiy autosave qoralamalari (belgisiz) navbatga tushmaydi;
 * - har qanday chop etish (shu navbatdagi tugma, admin'dagi "Publish changes", rejalashtirilgan
 *   publish) belgini o'chiradi — chop etilgan versiyada u yo'q;
 * - rad etish — oxirgi chop etilgan versiya qayta tiklanadi (`restoreVersion`): u ham belgisiz.
 *
 * Amallar — faqat admin/editor, Local API `overrideAccess: false` (workflow va validatsiya
 * `posts` hook'larida), bitta tranzaksiyada, post qatori `FOR UPDATE` bilan qulflanadi.
 */

type Id = number

export const PENDING_REVISION_WHERE: Where = {
  and: [
    { workflowStatus: { equals: 'published' } },
    { _status: { equals: 'draft' } },
    { revisionSubmittedAt: { exists: true } },
  ],
}

export function isPendingRevision(
  post: Pick<Post, 'workflowStatus' | '_status' | 'revisionSubmittedAt'>,
): boolean {
  return (
    post.workflowStatus === 'published' && post._status === 'draft' && !!post.revisionSubmittedAt
  )
}

export const PENDING_REVISIONS_LIMIT = 50

export interface PendingRevisionRow {
  id: Id
  /** Qoralama (yangi) sarlavha. */
  title: string
  /** Saytdagi sarlavha (o'zgargan bo'lsa ham). */
  liveTitle: string | null
  slug: string | null
  submittedAt: string
  submittedBy: { id: Id; name: string | null; email: string | null } | null
  notesForEditor: string | null
  changes: RevisionChange[]
}

const DIFF_SELECT = {
  title: true,
  excerpt: true,
  meta: true,
  content: true,
  coverImage: true,
  coverAlt: true,
  socialTitle: true,
  faq: true,
  tags: true,
  category: true,
  sources: true,
} as const

function relIdOf(value: unknown): Id | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return ((value as { id?: Id }).id ?? null) as Id | null
  return Number(value) || null
}

/** Navbat uchun: kutilayotgan o'zgarishlar (oxirgi yuborilgan — tepada) va farq xulosasi. */
export async function listPendingRevisions(
  req: PayloadRequest,
  limit = PENDING_REVISIONS_LIMIT,
): Promise<{ rows: PendingRevisionRow[]; totalDocs: number }> {
  const { payload } = req
  const locale = { locale: 'uz-Latn' as const, fallbackLocale: false as const }
  const { docs, totalDocs } = await payload.find({
    collection: 'posts',
    where: PENDING_REVISION_WHERE,
    draft: true,
    sort: '-revisionSubmittedAt',
    limit,
    depth: 0,
    select: {
      ...DIFF_SELECT,
      slug: true,
      notesForEditor: true,
      revisionSubmittedAt: true,
      revisionSubmittedBy: true,
    },
    overrideAccess: false,
    req,
    ...locale,
  })
  if (docs.length === 0) return { rows: [], totalDocs }

  const ids = docs.map((doc) => doc.id)
  const { docs: liveDocs } = await payload.find({
    collection: 'posts',
    where: { id: { in: ids } },
    draft: false,
    limit: ids.length,
    pagination: false,
    depth: 0,
    select: DIFF_SELECT,
    overrideAccess: false,
    req,
    ...locale,
  })
  const live = new Map(liveDocs.map((doc) => [doc.id, doc]))

  // Kim yuborgan — ism (editor boshqa foydalanuvchilarni o'qiy olmaydi; faqat ism/email).
  const userIds = [
    ...new Set(
      docs.map((doc) => relIdOf(doc.revisionSubmittedBy)).filter((id): id is Id => id !== null),
    ),
  ]
  const users = userIds.length
    ? (
        await payload.find({
          collection: 'users',
          where: { id: { in: userIds } },
          limit: userIds.length,
          pagination: false,
          depth: 0,
          select: { name: true, email: true },
          overrideAccess: true,
          req,
        })
      ).docs
    : []
  const userById = new Map(users.map((user) => [user.id, user]))

  const rows = docs.map((doc): PendingRevisionRow => {
    const current = live.get(doc.id)
    const submittedById = relIdOf(doc.revisionSubmittedBy)
    const user = submittedById === null ? undefined : userById.get(submittedById)
    return {
      id: doc.id,
      title: doc.title,
      liveTitle: current?.title ?? null,
      slug: doc.slug ?? null,
      submittedAt: doc.revisionSubmittedAt as string,
      submittedBy:
        submittedById === null
          ? null
          : { id: submittedById, name: user?.name ?? null, email: user?.email ?? null },
      notesForEditor: doc.notesForEditor?.trim() || null,
      changes: current ? summarizeRevision(current, doc) : [],
    }
  })
  return { rows, totalDocs }
}

async function loadPendingRevision(req: PayloadRequest, id: Id): Promise<Post> {
  await lockPostRow(req.payload, id, req)
  const post = await req.payload.findByID({
    collection: 'posts',
    id,
    draft: true,
    depth: 0,
    disableErrors: true,
    overrideAccess: false,
    req,
    locale: 'uz-Latn',
    fallbackLocale: false,
  })
  if (!post) throw new EditorialError(`Post topilmadi (id: ${id}).`, 404)
  if (!isPendingRevision(post)) {
    throw new EditorialError(
      `Post #${id} da kutilayotgan o‘zgarish yo‘q — u allaqachon chop etilgan yoki rad etilgan.`,
      409,
    )
  }
  return post
}

export interface RevisionActionResult {
  post: Pick<Post, 'id' | 'title' | 'slug' | '_status' | 'workflowStatus'>
}

function pick(post: Post): RevisionActionResult['post'] {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    _status: post._status,
    workflowStatus: post.workflowStatus,
  }
}

/**
 * "O'zgarishlarni chop etish" — admin'dagi "Publish changes" bilan bir xil yo'l: oxirgi qoralama
 * versiya `_status: 'published'` bilan saqlanadi (joriy foydalanuvchi nomidan). Sayt keshi,
 * Telegram xabarini tahrirlash, IndexNow, kirill — `posts` hook'lari; belgi o'chadi.
 */
export async function publishRevision(
  req: PayloadRequest,
  args: { id: Id },
): Promise<RevisionActionResult> {
  assertEditor(req)
  return inTransaction(req, async () => {
    await loadPendingRevision(req, args.id)
    const published = await req.payload.update({
      collection: 'posts',
      id: args.id,
      data: { _status: 'published' },
      draft: false,
      depth: 0,
      overrideAccess: false,
      req,
      locale: 'uz-Latn',
      fallbackLocale: false,
    })
    return { post: pick(published) }
  })
}

/**
 * "Rad etish" — kutilayotgan qoralama bekor qilinadi: oxirgi **chop etilgan** versiya qayta
 * tiklanadi (`restoreVersion`, chop etilgan holatda). Saytdagi kontent o'zgarmaydi (o'sha
 * versiya — saytdagi holat), qoralama versiyalar tarixda qoladi, lekin endi oxirgisi emas.
 * Sabab majburiy — audit log'ga alohida yozuv (`diff.pendingRevision`).
 */
export async function discardRevision(
  req: PayloadRequest,
  args: { id: Id; reason: unknown },
): Promise<RevisionActionResult & { restoredVersion: string }> {
  assertEditor(req)
  const reason = typeof args.reason === 'string' ? args.reason.trim() : ''
  if (!reason) throw new EditorialError('Rad etish sababi majburiy.', 400)
  if (reason.length > REJECT_REASON_MAX_LENGTH) {
    throw new EditorialError(
      `Rad etish sababi ${REJECT_REASON_MAX_LENGTH} belgidan oshmasligi kerak.`,
      400,
    )
  }

  return inTransaction(req, async () => {
    const pending = await loadPendingRevision(req, args.id)
    const { docs } = await req.payload.findVersions({
      collection: 'posts',
      where: {
        and: [{ parent: { equals: args.id } }, { 'version._status': { equals: 'published' } }],
      },
      sort: '-updatedAt',
      limit: 1,
      depth: 0,
      overrideAccess: false,
      req,
    })
    const version = docs[0]
    if (!version) {
      throw new EditorialError(
        `Post #${args.id} ning chop etilgan versiyasi tarixda topilmadi (versiyalar soni ` +
          'cheklangan) — o‘zgarishlarni admin panelda qo‘lda qaytaring yoki chop eting.',
        409,
      )
    }
    await req.payload.restoreVersion({
      collection: 'posts',
      id: version.id,
      depth: 0,
      overrideAccess: false,
      req,
    })
    const restored = await req.payload.findByID({
      collection: 'posts',
      id: args.id,
      draft: true,
      depth: 0,
      overrideAccess: false,
      req,
      locale: 'uz-Latn',
      fallbackLocale: false,
    })
    await writeAuditLog(req, {
      action: 'update',
      collection: 'posts',
      docId: args.id,
      title: restored.title,
      diff: {
        pendingRevision: {
          from: {
            title: pending.title,
            submittedAt: pending.revisionSubmittedAt ?? null,
            submittedBy: relIdOf(pending.revisionSubmittedBy),
            notesForEditor: pending.notesForEditor ?? null,
          },
          to: { discarded: true, reason, restoredVersion: String(version.id) },
        },
      },
    })
    return { post: pick(restored), restoredVersion: String(version.id) }
  })
}
