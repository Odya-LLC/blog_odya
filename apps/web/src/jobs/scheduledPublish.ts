import type { Payload } from 'payload'

import { captureError } from '@/lib/sentry'

import { SCHEDULE_PUBLISH_MAX_ATTEMPTS, SCHEDULE_PUBLISH_TASK } from './constants'

/**
 * Rejalashtirilgan postlar uchun xavfsizlik to'ri (OBLOG-100), har scheduler chaqiruvida
 * (`/api/jobs/run` va `autorun` tick'i):
 *
 * Post `scheduled` holatida bo'lsa-yu, uni chop etadigan bajarilishi mumkin bo'lgan
 * `schedulePublish` job'i bo'lmasa — yangisi navbatga qo'yiladi (`waitUntil = scheduledAt`;
 * vaqti o'tgan bo'lsa — shu chaqiruvning o'zida bajariladi). Sabablari:
 * - Payload'ning `schedulePublish` task'ida retry yo'q: bitta vaqtinchalik xato (DB uzilishi,
 *   function timeout) job'ni `hasError` bilan yakunlaydi va post abadiy `scheduled` da qolardi;
 * - job admin'dagi "Schedule publish" oynasidan qo'lda o'chirilgan bo'lishi mumkin (bekor qilish —
 *   holatni "Tekshiruvda" ga o'tkazish, `syncScheduledPublish` job'ni o'zi o'chiradi).
 *
 * Xatoli urinishlar {@link SCHEDULE_PUBLISH_MAX_ATTEMPTS} taga yetsa — qayta qo'yilmaydi (cheksiz
 * sikl bo'lmasin), Sentry'ga bir marta yuboriladi; muharrir vaqtni o'zgartirsa yoki qo'lda chop
 * etsa — eski xatoli job'lar o'chadi (`syncScheduledPublish`). Qayta qo'yilgan job foydalanuvchisiz
 * (tizim nomidan) ishlaydi — kalit egasining huquqi o'zgargan bo'lsa ham post chiqadi.
 */

export interface EnsureScheduledResult {
  /** Navbatga qayta qo'yilgan job'lar. */
  queued: number
  /** Urinishlar tugagan (qo'lda aralashuv kerak) postlar. */
  failed: number
}

interface ScheduleJobInput {
  doc?: { relationTo?: string; value?: unknown } | null
}

/** Oxirgi xatodan beri shuncha vaqt o'tmagan bo'lsa — Sentry'ga yuboriladi (bir marta). */
const REPORT_WINDOW_MS = 15 * 60 * 1000

export async function ensureScheduledPublishJobs(
  payload: Payload,
  now = Date.now(),
): Promise<EnsureScheduledResult> {
  const result: EnsureScheduledResult = { queued: 0, failed: 0 }
  const { docs: posts } = await payload.find({
    collection: 'posts',
    where: { workflowStatus: { equals: 'scheduled' } },
    select: { scheduledAt: true },
    depth: 0,
    pagination: false,
    limit: 0,
  })
  if (posts.length === 0) return result

  const { docs: jobs } = await payload.find({
    collection: 'payload-jobs',
    where: {
      and: [
        { taskSlug: { equals: SCHEDULE_PUBLISH_TASK } },
        { completedAt: { exists: false } },
        { 'input.doc.relationTo': { equals: 'posts' } },
      ],
    },
    select: { input: true, hasError: true, updatedAt: true },
    depth: 0,
    pagination: false,
    limit: 0,
  })
  const byPost = new Map<string, typeof jobs>()
  for (const job of jobs) {
    const value = (job.input as ScheduleJobInput | null)?.doc?.value
    if (value === undefined || value === null) continue
    const key = String(typeof value === 'object' ? (value as { id?: unknown }).id : value)
    byPost.set(key, [...(byPost.get(key) ?? []), job])
  }

  for (const post of posts) {
    if (!post.scheduledAt) continue
    const own = byPost.get(String(post.id)) ?? []
    if (own.some((job) => job.hasError !== true)) continue
    if (own.length >= SCHEDULE_PUBLISH_MAX_ATTEMPTS) {
      result.failed++
      const lastFailure = Math.max(...own.map((job) => Date.parse(job.updatedAt ?? '') || 0))
      const message =
        `Rejalashtirilgan post #${post.id} ${own.length} urinishda chop etilmadi — ` +
        'admin panelda tekshiring (vaqtni o‘zgartiring yoki qo‘lda chop eting)'
      payload.logger.error({ postId: post.id, msg: message })
      if (now - lastFailure < REPORT_WINDOW_MS) {
        captureError(new Error(message), {
          tags: { job_task: SCHEDULE_PUBLISH_TASK },
          extra: { postId: post.id, scheduledAt: post.scheduledAt },
        })
      }
      continue
    }
    await payload.jobs.queue({
      task: SCHEDULE_PUBLISH_TASK,
      input: { type: 'publish', doc: { relationTo: 'posts', value: post.id } },
      waitUntil: new Date(post.scheduledAt),
    })
    result.queued++
    payload.logger.warn({
      postId: post.id,
      scheduledAt: post.scheduledAt,
      previousAttempts: own.length,
      msg: 'Rejalashtirilgan post uchun schedulePublish job’i yo‘q edi — qayta navbatga qo‘yildi',
    })
  }
  return result
}
