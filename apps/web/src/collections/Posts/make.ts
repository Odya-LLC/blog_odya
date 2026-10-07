import type { Locale } from '@blog-odya/shared/locales'
import { after } from 'next/server'
import type { CollectionAfterChangeHook, Payload, PayloadRequest } from 'payload'

import { DEFAULT_QUEUE, MAKE_WEBHOOK_TASK } from '@/jobs/constants'
import { getRunDeadline } from '@/jobs/context'
import type { Post } from '@/payload-types'
import { loadMakeConfig } from '@/social/make/config'
import { findMakeDelivery, MAKE_EVENT, makeDeliveryKey } from '@/social/make/deliver'

/**
 * Posts ↔ Make.com avtopost (OBLOG-91).
 *
 * `queueMakeAfterChange` (`afterChange`): post **birinchi marta** chop etilganda
 * (`workflowStatus` → `published`: publish tugmasi, rejalashtirilgan publish job'i, MCP
 * auto-publish) `social-settings.scripts` dagi har yozuv uchun `make.webhook` job'i. Shartlar:
 * Make yoqilgan, webhook URL bor, `socialSkip` yo'q, shu (post, yozuv) hali yuborilmagan
 * (`social-deliveries`) va tugallanmagan job yo'q. Chop etilgan postni tahrirlash, qoralama,
 * autosave — trigger emas (Instagram postini tahrirlab bo'lmaydi — dublikat bo'lmasin).
 *
 * Darhol bajarish — Telegram bilan bir xil: `after()`; `/api/jobs/run` ichida yoki so'rov
 * kontekstidan tashqarida — scheduler tsikli. `req.context.skipMake = true` — o'chirish.
 */

export const makeHookDeps: { runAfter: (task: () => Promise<void>) => boolean } = {
  runAfter: (task) => {
    try {
      after(task)
      return true
    } catch {
      return false
    }
  },
}

export async function hasPendingMakeJob(
  payload: Payload,
  postId: number,
  script: Locale,
  req?: PayloadRequest,
): Promise<boolean> {
  const { totalDocs } = await payload.count({
    collection: 'payload-jobs',
    where: {
      and: [
        { taskSlug: { equals: MAKE_WEBHOOK_TASK } },
        { 'input.postId': { equals: postId } },
        { 'input.script': { equals: script } },
        { completedAt: { exists: false } },
        { hasError: { not_equals: true } },
      ],
    },
    ...(req ? { req } : {}),
  })
  return totalDocs > 0
}

/** Navbatdagi Make job'larini javobdan keyin ishga tushiradi (faqat shu id'lar). */
export function runMakeJobsSoon(payload: Payload, ids: (number | string)[]): boolean {
  if (ids.length === 0) return false
  if (getRunDeadline() !== undefined) return false
  return makeHookDeps.runAfter(async () => {
    try {
      await payload.jobs.run({
        queue: DEFAULT_QUEUE,
        where: { id: { in: ids } },
        limit: ids.length,
      })
    } catch (error) {
      payload.logger.error({ err: error, msg: 'Make: job’larni darhol bajarib bo‘lmadi' })
    }
  })
}

/**
 * Yuborilmagan yozuvlar uchun job qo'yadi (hook va admin "Make'ga yuborish" tugmasi). Qaytaradi:
 * yangi job id'lari.
 */
export async function queueMakeDeliveries(
  payload: Payload,
  postId: number,
  scripts: readonly Locale[],
  req?: PayloadRequest,
): Promise<(number | string)[]> {
  const ids: (number | string)[] = []
  for (const script of scripts) {
    const delivery = await findMakeDelivery(payload, makeDeliveryKey(postId, MAKE_EVENT, script))
    if (delivery?.status === 'sent') continue
    if (await hasPendingMakeJob(payload, postId, script, req)) continue
    const job = await payload.jobs.queue({
      task: MAKE_WEBHOOK_TASK,
      queue: DEFAULT_QUEUE,
      input: { postId, script },
      ...(req ? { req } : {}),
    })
    ids.push(job.id)
  }
  return ids
}

export const queueMakeAfterChange: CollectionAfterChangeHook<Post> = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (req.context?.skipMake) return doc
  if (doc._status !== 'published' || doc.workflowStatus !== 'published' || doc.socialSkip) {
    return doc
  }
  if (previousDoc?.workflowStatus === 'published') return doc

  const { payload } = req
  const config = await loadMakeConfig(payload)
  if (!config.enabled || config.scripts.length === 0) return doc
  if (!config.webhookUrl) {
    payload.logger.warn({
      postId: doc.id,
      msg: 'Make: yoqilgan, lekin webhook URL sozlanmagan — avtopost o‘tkazildi',
    })
    return doc
  }
  const ids = await queueMakeDeliveries(payload, doc.id, config.scripts, req)
  runMakeJobsSoon(payload, ids)
  return doc
}
