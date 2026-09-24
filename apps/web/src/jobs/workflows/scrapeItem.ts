import type { Payload, WorkflowConfig } from 'payload'

import type { TaskItemExtract, TaskItemFetch } from '@/payload-types'

import {
  ITEM_CLASSIFY_TASK,
  ITEM_DEDUPE_TASK,
  ITEM_EXTRACT_TASK,
  ITEM_FETCH_TASK,
  SCRAPE_ITEM_WORKFLOW,
  SCRAPE_QUEUE,
  SCRAPE_STEP_MIN_WINDOW_MS,
} from '../constants'
import { getRunDeadline } from '../context'
import { markItemError } from '../tasks/itemFetch'

/**
 * `scrapeItem` workflow (TZ §3.5): bitta yangi URL uchun `item.fetch` → `item.extract` →
 * (M2-03, OBLOG-17) `item.dedupe` → `item.classify`.
 *
 * - `item.fetch` `deferred` qaytarsa (domen rate limit'i task byudjetiga sig'madi) — shu input
 *   bilan yangi job `waitUntil = retryAt` bilan navbatga qo'yiladi, joriy job muvaffaqiyatli
 *   tugaydi (retry sarflanmaydi).
 * - Task'lar 3 marta qayta uriniladi (backoff); oxirgi urinish ham xato bo'lsa, element
 *   `status = error`, `error` — xato matni (TZ §3.5 "Ishonchlilik").
 * - Muvaffaqiyatli bosqichlar retry'da qayta bajarilmaydi (Payload task natijasini tiklaydi).
 * - `item.dedupe` / `item.classify` faqat matn ajratilgandan keyin (`extract.status = scraped`).
 *   Ularning yakuniy xatosi elementni `error` ga o'tkazmaydi (u allaqachon `scraped` —
 *   `writeScrapeResult` yozmaydi): element navbatda score/klastersiz qoladi, matn yo'qolmaydi.
 *
 * **Vaqt chegarasi (OBLOG-33).** `/api/jobs/run` ichida (`getRunDeadline`) har keyingi bosqich
 * (extract, dedupe, classify) oldidan run deadline'igacha `SCRAPE_STEP_MIN_WINDOW_MS` qolganmi
 * tekshiriladi. Qolmasa — workflow bajarilgan bosqichlar natijasi (`resume`) bilan **yangi job**
 * sifatida navbatga qo'yiladi va joriy job muvaffaqiyatli tugaydi; yangi job `resume` dagi
 * bosqichlarni qayta bajarmaydi (fetch qayta yuklanmaydi, extract qayta ajratilmaydi).
 * Nega xato tashlab, Payload retry'iga (task natijalari tiklanadi) tayanilmaydi — Payload 3.90:
 * - workflow darajasidagi xato (`handleWorkflowError`): `scrapeItem` da `retries` yo'q →
 *   `hasFinalError = true` — job butunlay xato bo'ladi;
 * - workflow'ga `retries` qo'shilsa — har to'xtash `job.totalTried` ni oshiradi, xato
 *   log'lanadi, javobda `failed` sanaladi, backoff `waitUntil` qo'yiladi va task xatolari ham
 *   workflow limiti bilan cheklanib qoladi (`getWorkflowRetryBehavior`);
 * - task ichidan xato — task urinishi (3 tadan biri) sarflanadi (`handleTaskError`).
 * `resume` esa retry sarflamaydi va ishni yo'qotmaydi. Yangi job keyingi batch'da birinchi
 * bosqichini kamida grace (10 s) oynasi bilan boshlaydi, shuning uchun cheksiz qoldirish yo'q.
 */

/** Payload `TaskError` (eksport qilinmaydi) — `args` bo'yicha aniqlaymiz. */
interface TaskErrorLike {
  message: string
  args?: {
    taskSlug?: string
    taskStatus?: { complete?: boolean; totalTried?: number } | null
    retriesConfig?: { attempts?: number } | null
  }
}

/** Payload `handleTaskError` bilan bir xil shart: task retry'lari tugagan. */
export function isFinalTaskError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true
  const args = (error as TaskErrorLike).args
  // Task'dan tashqaridagi (workflow) xato — workflow'da retry yo'q, demak yakuniy.
  if (!args) return true
  if (args.taskStatus?.complete) return false
  return (args.taskStatus?.totalTried ?? 0) >= (args.retriesConfig?.attempts ?? 0)
}

async function recordFinalError(payload: Payload, id: number, error: unknown): Promise<void> {
  const err = error as TaskErrorLike
  const step = err.args?.taskSlug ?? SCRAPE_ITEM_WORKFLOW
  try {
    await markItemError(payload, id, `${step}: ${err.message ?? String(error)}`)
  } catch (updateError) {
    payload.logger.error({ err: updateError, msg: 'scrapeItem: xato holatini yozib bo‘lmadi', id })
  }
}

/** Bajarilgan bosqichlar (`job.input.resume`) — qayta navbatga qo'yilgan workflow uchun. */
export interface ScrapeResume {
  fetched: TaskItemFetch['output']
  extracted?: TaskItemExtract['output']
  deduped?: boolean
}

function parseResume(value: unknown): ScrapeResume | null {
  if (!value || typeof value !== 'object') return null
  const fetched = (value as { fetched?: unknown }).fetched
  if (!fetched || typeof fetched !== 'object' || !('status' in fetched)) return null
  return value as ScrapeResume
}

/** `/api/jobs/run` ichida keyingi bosqich uchun vaqt qolmadimi (kontekstsiz — hech qachon). */
export function outOfRunTime(now = Date.now()): boolean {
  const deadline = getRunDeadline()
  return deadline !== undefined && deadline - now < SCRAPE_STEP_MIN_WINDOW_MS
}

export const scrapeItemWorkflow: WorkflowConfig<'scrapeItem'> = {
  slug: SCRAPE_ITEM_WORKFLOW,
  label: 'Maqolani yig‘ish (fetch → extract → dedupe → classify)',
  interfaceName: 'WorkflowScrapeItem',
  queue: SCRAPE_QUEUE,
  inputSchema: [
    { name: 'scrapedItemId', type: 'number', required: true },
    {
      name: 'contentHtml',
      type: 'textarea',
      admin: { description: 'RSS’dagi matn (rss_only manbalar uchun extract shu matndan)' },
    },
    {
      name: 'resume',
      type: 'json',
      admin: {
        description:
          'Oldingi chaqiruvda bajarilgan bosqichlar natijasi (vaqt yetmay qayta navbatga qo‘yilgan)',
      },
    },
  ],
  handler: async ({ job, req, tasks }) => {
    const { scrapedItemId, contentHtml } = job.input
    const resume = parseResume(job.input.resume)
    /** Vaqt yetmadi: bajarilganlar bilan yangi job (joriy job muvaffaqiyatli tugaydi). */
    const yieldWith = async (state: ScrapeResume) => {
      await req.payload.jobs.queue({
        workflow: SCRAPE_ITEM_WORKFLOW,
        queue: SCRAPE_QUEUE,
        // RSS matni endi kerak emas — raw HTML arxivda (`fetched.rawHtmlKey`).
        input: { scrapedItemId, resume: state as unknown as Record<string, unknown> },
      })
    }
    try {
      const fetched =
        resume?.fetched ?? (await tasks[ITEM_FETCH_TASK]('fetch', { input: { scrapedItemId } }))

      if (fetched.status === 'deferred') {
        await req.payload.jobs.queue({
          workflow: SCRAPE_ITEM_WORKFLOW,
          queue: SCRAPE_QUEUE,
          input: { scrapedItemId, contentHtml },
          waitUntil: new Date(fetched.retryAt ?? Date.now() + 60_000),
        })
        return
      }
      if (!fetched.rawHtmlKey || (fetched.mode !== 'page' && fetched.mode !== 'rss')) return

      if (!resume?.extracted && outOfRunTime()) return yieldWith({ fetched })
      const extracted =
        resume?.extracted ??
        (await tasks[ITEM_EXTRACT_TASK]('extract', {
          input: {
            scrapedItemId,
            rawHtmlKey: fetched.rawHtmlKey,
            mode: fetched.mode,
            fetchMeta: fetched,
          },
        }))
      if (extracted.status !== 'scraped') return

      if (!resume?.deduped) {
        if (outOfRunTime()) return yieldWith({ fetched, extracted })
        await tasks[ITEM_DEDUPE_TASK]('dedupe', { input: { scrapedItemId } })
      }
      if (outOfRunTime()) return yieldWith({ fetched, extracted, deduped: true })
      await tasks[ITEM_CLASSIFY_TASK]('classify', { input: { scrapedItemId } })
    } catch (error) {
      if (isFinalTaskError(error)) await recordFinalError(req.payload, scrapedItemId, error)
      throw error
    }
  },
}
