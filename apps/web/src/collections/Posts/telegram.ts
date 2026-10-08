import { LOCALES, type Locale } from '@blog-odya/shared/locales'
import { after } from 'next/server'
import type { CollectionAfterChangeHook, FieldHook, Payload, PayloadRequest } from 'payload'

import { DEFAULT_QUEUE, TELEGRAM_POST_TASK } from '@/jobs/constants'
import { getRunDeadline } from '@/jobs/context'
import type { Post } from '@/payload-types'
import { lockPostRow, readTelegramState } from '@/telegram/autopost'
import { loadTelegramConfig } from '@/telegram/config'

/**
 * Posts ↔ Telegram avtopost (TZ §7.1).
 *
 * `queueTelegramAfterChange` (`afterChange`): post chop etilgan holatda saqlanganda (publish
 * tugmasi, MCP, scheduled publish job'i) har faol kanal uchun `telegram.post` job'i:
 * - birinchi chop etish (`workflowStatus` → `published`) — barcha faol kanallarga;
 * - allaqachon chop etilgan post qayta chop etilsa — faqat `telegram[]` da qatori bor
 *   (yuborilgan yoki xato bergan) kanallarga: job matn xeshini solishtiradi, sarlavha/lid
 *   o'zgargan bo'lsa xabarni tahrirlaydi, o'zgarmagan bo'lsa — hech narsa (dublikat yo'q).
 *   Qoralama/autosave (`_status: draft`), arxivlash va `telegramSkip` — trigger emas.
 * - (post, yozuv) uchun tugallanmagan job bo'lsa, yangisi qo'yilmaydi (u ishlaganda baribir
 *   postning oxirgi holatini o'qiydi).
 *
 * Darhol bajarish: Next.js `after()` (Vercel'da `waitUntil`) — javob yuborilgach shu job'lar
 * ishga tushiriladi (≤ bir necha soniya). So'rov kontekstidan tashqarida (CLI, testlar) yoki
 * `/api/jobs/run` ichida (scheduled publish) — job navbatda qoladi va scheduler tsiklida (runner
 * sikli o'sha chaqiruvning o'zida) bajariladi.
 *
 * `req.context.skipTelegram = true` — ommaviy import va shu kabilarda o'chirish uchun.
 */

/** Javobdan keyin bajarish; `false` — so'rov konteksti yo'q (keyingi scheduler tsikli). */
export type RunAfter = (task: () => Promise<void>) => boolean

export const telegramHookDeps: { runAfter: RunAfter } = {
  runAfter: (task) => {
    try {
      after(task)
      return true
    } catch {
      return false
    }
  },
}

async function hasPendingJob(req: PayloadRequest, postId: number, script: Locale) {
  const { totalDocs } = await req.payload.count({
    collection: 'payload-jobs',
    where: {
      and: [
        { taskSlug: { equals: TELEGRAM_POST_TASK } },
        { 'input.postId': { equals: postId } },
        { 'input.script': { equals: script } },
        { completedAt: { exists: false } },
        { hasError: { not_equals: true } },
      ],
    },
    req,
  })
  return totalDocs > 0
}

/** Navbatdagi job'larni hozir (javobdan keyin) ishga tushiradi — faqat shu id'lar. */
export function runTelegramJobsSoon(payload: Payload, ids: (number | string)[]): boolean {
  if (ids.length === 0) return false
  // `/api/jobs/run` ichida (scheduled publish) runner o'zi keyingi batch'da oladi — ikki marta
  // ishga tushirmaslik uchun `after()` ishlatilmaydi.
  if (getRunDeadline() !== undefined) return false
  return telegramHookDeps.runAfter(async () => {
    try {
      // `run` (runByID emas): faqat `processing: false` va muddati kelgan job'lar olinadi —
      // scheduler bir vaqtda olgan job qayta bajarilmaydi.
      await payload.jobs.run({
        queue: DEFAULT_QUEUE,
        where: { id: { in: ids } },
        limit: ids.length,
      })
    } catch (error) {
      payload.logger.error({ err: error, msg: 'Telegram: job’larni darhol bajarib bo‘lmadi' })
    }
  })
}

export const queueTelegramAfterChange: CollectionAfterChangeHook<Post> = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (req.context?.skipTelegram) return doc
  if (doc._status !== 'published' || doc.workflowStatus !== 'published' || doc.telegramSkip) {
    return doc
  }
  const firstPublish = previousDoc?.workflowStatus !== 'published'
  const entries = doc.telegram ?? []
  const scripts = firstPublish
    ? [...LOCALES]
    : LOCALES.filter((script) => entries.some((entry) => entry.script === script))
  if (scripts.length === 0) return doc

  const { payload } = req
  // Shu tranzaksiyada (`req`; `req.locale` tiklanadi): `req`siz o'qish pool'dan ikkinchi ulanishni
  // kutardi — parallel publish'larda `Failed query` (OBLOG-110).
  const config = await loadTelegramConfig(payload, req)
  if (!config.token) {
    payload.logger.warn({
      postId: doc.id,
      msg: 'Telegram: TELEGRAM_BOT_TOKEN sozlanmagan — avtopost o‘tkazildi',
    })
    return doc
  }

  const ids: (number | string)[] = []
  for (const script of scripts) {
    if (!config.channels[script]) {
      if (!config.disabled.includes(script)) {
        payload.logger.warn({
          postId: doc.id,
          script,
          msg: `Telegram: ${script} kanali sozlanmagan (telegram-settings yoki env) — o‘tkazildi`,
        })
      }
      continue
    }
    if (await hasPendingJob(req, doc.id, script)) continue
    const job = await payload.jobs.queue({
      task: TELEGRAM_POST_TASK,
      queue: DEFAULT_QUEUE,
      input: { postId: doc.id, script },
      req,
    })
    ids.push(job.id)
  }
  runTelegramJobsSoon(payload, ids)
  return doc
}

/**
 * `telegram[]` maydoni: saqlashda qiymat har doim **asosiy jadvaldagi** (job yozgan) holatdan
 * olinadi. Sabab: Payload `update` da `originalDoc` — oxirgi versiya (qoralama bo'lishi mumkin),
 * job esa holatni faqat asosiy jadvalga yozadi; aks holda eskirgan versiya qiymati `messageId`
 * ni o'chirib, qayta yuborishga (dublikat) olib kelardi. Yangi post (shu jumladan nusxa —
 * `duplicate`) bo'sh holat bilan boshlanadi. `context.telegramStateWrite` — ataylab yozish.
 */
export const preserveTelegramState: FieldHook<Post> = async ({
  operation,
  originalDoc,
  req,
  value,
}) => {
  if (req.context?.telegramStateWrite) return value
  if (operation === 'create') return []
  const id = originalDoc?.id
  if (id === undefined || id === null) return value
  // Saqlash tugaguncha job holat yozmasin (aks holda bu yerda o'qilgan qiymat eskirib qoladi).
  await lockPostRow(req.payload, id, req)
  return readTelegramState(req.payload, id, req)
}
