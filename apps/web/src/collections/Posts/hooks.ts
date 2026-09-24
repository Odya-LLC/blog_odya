import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  ValidationError,
} from 'payload'

import { isAdminUser, roleOf } from '@/access'
import { readingTimeMinutes } from '@/lib/lexical'
import type { Post } from '@/payload-types'

import {
  checkTransition,
  CLAIM_LOCK_MS,
  isWorkflowState,
  type PostWorkflowStatus,
  type WorkflowState,
} from './workflow'

type Id = number | string

function relId(value: unknown): Id | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return ((value as { id?: Id }).id ?? null) as Id | null
  return value as Id
}

function toTime(value: unknown): number | null {
  if (!value) return null
  const time = new Date(value as string).getTime()
  return Number.isNaN(time) ? null : time
}

function invalid(path: string, message: string): ValidationError {
  return new ValidationError({ collection: 'posts', errors: [{ path, message }] })
}

function forbidden(message: string): APIError {
  return new APIError(message, 403, null, true)
}

/**
 * Workflow (TZ §4.1): o'tish qoidalari, rol cheklovlari, `claim` qulfi va holatga bog'liq maydonlar.
 *
 * - Yangi post faqat `draft` holatida yaratiladi.
 * - Publish (`_status: 'published'`) faqat `review`/`scheduled` dan (holat avtomatik `published`
 *   bo'ladi) yoki allaqachon chop etilgan postni yangilash uchun. `draft → published` rad etiladi.
 * - `published` holatiga faqat publish orqali o'tiladi; `archived` — faqat admin, publish saqlash bilan
 *   (qoralama saqlash asosiy hujjatni o'zgartirmaydi).
 * - `in_progress`: `assignee` va `lockedUntil` (2 soat) qo'yiladi; qulf faol bo'lsa boshqa editor
 *   postni o'zgartira olmaydi (admin — mumkin).
 * - `rejected` — sabab majburiy; `scheduled` — kelajakdagi `scheduledAt` majburiy.
 */
export const enforceWorkflow: CollectionBeforeChangeHook<Post> = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const user = req.user?.collection === 'users' ? req.user : null
  const role = user ? roleOf(user) : undefined
  const now = Date.now()

  const prevRaw = operation === 'create' ? null : (originalDoc?.workflowStatus ?? 'draft')
  const prev: WorkflowState | null = prevRaw && isWorkflowState(prevRaw) ? prevRaw : null
  const isPublishing = data._status === 'published'

  const requested: unknown = data.workflowStatus ?? prev ?? 'draft'
  if (!isWorkflowState(requested) || requested === 'scraped') {
    throw invalid('workflowStatus', `Noma'lum holat: ${String(requested)}`)
  }
  let target: PostWorkflowStatus = requested
  // Admin'dagi "Publish" (yoki scheduler) tekshiruvdagi/rejalashtirilgan postni chop etadi.
  if (isPublishing && (target === 'review' || target === 'scheduled')) target = 'published'

  if (operation === 'create') {
    if (target !== 'draft') {
      throw invalid(
        'workflowStatus',
        `Yangi post faqat "draft" holatida yaratiladi (so'ralgan: ${target}). Holat o'tishi: draft → ${target}.`,
      )
    }
  }

  // Claim qulfi: boshqa foydalanuvchi olgan va muddati o'tmagan post.
  if (operation === 'update' && prev === 'in_progress' && user && !isAdminUser(user)) {
    const assignee = relId(originalDoc?.assignee)
    const lockedUntil = toTime(originalDoc?.lockedUntil)
    if (
      assignee !== null &&
      String(assignee) !== String(user.id) &&
      lockedUntil &&
      lockedUntil > now
    ) {
      throw forbidden(
        `Post boshqa foydalanuvchi tomonidan band qilingan (${new Date(lockedUntil).toISOString()} gacha).`,
      )
    }
  }

  const from: WorkflowState = prev ?? 'draft'
  if (target !== from) {
    const check = checkTransition(from, target, role)
    if (!check.ok) {
      if (check.status === 403) throw forbidden(check.message)
      throw invalid('workflowStatus', check.message)
    }
  }

  if (isPublishing && target !== 'published' && target !== 'archived') {
    throw invalid(
      'workflowStatus',
      `Holat o'tishi ruxsat etilmagan: ${from} → published. Avval postni tekshiruvga (review) yuboring.`,
    )
  }
  if (target === 'published' && from !== 'published' && !isPublishing) {
    throw invalid(
      'workflowStatus',
      `"published" holatiga faqat chop etish (Publish, _status: 'published') orqali o'tiladi.`,
    )
  }
  if (target === 'archived' && from !== 'archived' && data._status === 'draft') {
    throw invalid(
      'workflowStatus',
      "Arxivlash qoralama sifatida saqlanmaydi — o'zgarishlarni chop eting (Publish).",
    )
  }

  const next: Partial<Post> = { ...data, workflowStatus: target }

  if (target === 'in_progress' && from !== 'in_progress') {
    next.assignee = (relId(data.assignee) ??
      user?.id ??
      relId(originalDoc?.assignee)) as Post['assignee']
    next.lockedUntil = data.lockedUntil ?? new Date(now + CLAIM_LOCK_MS).toISOString()
  }
  if (target !== 'in_progress' && from === 'in_progress') {
    next.lockedUntil = null
  }

  if (target === 'rejected' && from !== 'rejected') {
    const reason = data.rejectReason ?? originalDoc?.rejectReason
    if (!reason || !String(reason).trim()) {
      throw invalid('rejectReason', 'Rad etish sababi majburiy.')
    }
  }

  if (target === 'scheduled') {
    const scheduledAt = toTime(data.scheduledAt ?? originalDoc?.scheduledAt)
    const changed =
      from !== 'scheduled' ||
      (data.scheduledAt !== undefined &&
        toTime(data.scheduledAt) !== toTime(originalDoc?.scheduledAt))
    if (!scheduledAt)
      throw invalid('scheduledAt', 'Rejalashtirish uchun chop etish vaqti majburiy.')
    if (changed && scheduledAt <= now) {
      throw invalid('scheduledAt', "Chop etish vaqti kelajakda bo'lishi kerak.")
    }
  }

  if (target === 'published' && from !== 'published') {
    next.publishedAt = data.publishedAt ?? originalDoc?.publishedAt ?? new Date(now).toISOString()
  }

  return next
}

/**
 * Hosila maydonlar: `readingTime` (lotin matnidan, avtomatik) va `aiDisclosure`
 * (`rewrittenBy` `ai_agent` ga o'zgarganda avtomatik yoqiladi, TZ §10.3).
 */
export const deriveFields: CollectionBeforeChangeHook<Post> = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const next: Partial<Post> = { ...data }
  const { localization } = req.payload.config
  const defaultLocale = localization ? localization.defaultLocale : undefined
  const isDefaultLocale = !defaultLocale || (req.locale ?? defaultLocale) === defaultLocale

  if (isDefaultLocale && data.content !== undefined) {
    next.readingTime = readingTimeMinutes(data.content)
  }

  const prevRewrittenBy = operation === 'create' ? undefined : originalDoc?.rewrittenBy
  if (data.rewrittenBy === 'ai_agent' && prevRewrittenBy !== 'ai_agent') {
    next.aiDisclosure = true
  }
  return next
}

const SCHEDULE_TASK = 'schedulePublish'

/**
 * Rejalashtirilgan chop etish (TZ §7: Payload `schedulePublish`, jobs queue): post `scheduled`
 * holatiga o'tganda (yoki vaqti o'zgarganda) `schedulePublish` job'i `scheduledAt` ga navbatga
 * qo'yiladi; holatdan chiqqanda kutilayotgan job'lar bekor qilinadi. Job bajarilganda publish
 * saqlanadi va `enforceWorkflow` holatni `published` ga o'tkazadi.
 */
export const syncScheduledPublish: CollectionAfterChangeHook<Post> = async ({
  doc,
  previousDoc,
  req,
}) => {
  const was = previousDoc?.workflowStatus
  const now = doc.workflowStatus
  const timeChanged = toTime(previousDoc?.scheduledAt) !== toTime(doc.scheduledAt)
  const enteringOrMoved = now === 'scheduled' && (was !== 'scheduled' || timeChanged)
  const leaving = was === 'scheduled' && now !== 'scheduled'
  if (!enteringOrMoved && !leaving) return doc

  await req.payload.delete({
    collection: 'payload-jobs',
    where: {
      and: [
        { taskSlug: { equals: SCHEDULE_TASK } },
        { 'input.doc.relationTo': { equals: 'posts' } },
        { 'input.doc.value': { equals: doc.id } },
        { processing: { equals: false } },
        { completedAt: { exists: false } },
      ],
    },
    req,
  })

  if (enteringOrMoved && doc.scheduledAt) {
    const user = req.user?.collection === 'users' ? req.user : null
    await req.payload.jobs.queue({
      task: SCHEDULE_TASK,
      input: {
        type: 'publish',
        doc: { relationTo: 'posts', value: doc.id },
        ...(user ? { user: { relationTo: 'users', value: user.id } } : {}),
      },
      waitUntil: new Date(doc.scheduledAt),
      req,
    })
  }
  return doc
}
