import type { Payload, WorkflowConfig } from 'payload'

import {
  ITEM_EXTRACT_TASK,
  ITEM_FETCH_TASK,
  SCRAPE_ITEM_WORKFLOW,
  SCRAPE_QUEUE,
} from '../constants'
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

export const scrapeItemWorkflow: WorkflowConfig<'scrapeItem'> = {
  slug: SCRAPE_ITEM_WORKFLOW,
  label: 'Maqolani yig‘ish (fetch → extract)',
  interfaceName: 'WorkflowScrapeItem',
  queue: SCRAPE_QUEUE,
  inputSchema: [
    { name: 'scrapedItemId', type: 'number', required: true },
    {
      name: 'contentHtml',
      type: 'textarea',
      admin: { description: 'RSS’dagi matn (rss_only manbalar uchun extract shu matndan)' },
    },
  ],
  handler: async ({ job, req, tasks }) => {
    const { scrapedItemId, contentHtml } = job.input
    try {
      const fetched = await tasks[ITEM_FETCH_TASK]('fetch', { input: { scrapedItemId } })

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

      await tasks[ITEM_EXTRACT_TASK]('extract', {
        input: {
          scrapedItemId,
          rawHtmlKey: fetched.rawHtmlKey,
          mode: fetched.mode,
          fetchMeta: fetched,
        },
      })
    } catch (error) {
      if (isFinalTaskError(error)) await recordFinalError(req.payload, scrapedItemId, error)
      throw error
    }
  },
}
