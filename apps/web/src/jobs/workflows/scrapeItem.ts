import type { WorkflowConfig } from 'payload'

import { SCRAPE_ITEM_WORKFLOW, SCRAPE_QUEUE } from '../constants'

/**
 * `scrapeItem` workflow (TZ §3.5): bitta yangi URL uchun `item.fetch` → `item.extract` →
 * (M2-03) `item.dedupe` → `item.classify`.
 *
 * **STUB (M2-01).** Qadamlar M2-02 (OBLOG-16: fetch/extract) va M2-03 (OBLOG-17:
 * dedupe/classify) da yoziladi. Hozir `feed.poll` job'larni `scrape` navbatiga qo'yadi, lekin
 * bu navbat `RUN_QUEUES` da yo'q — job'lar input'i (`scrapedItemId` + RSS'dagi `contentHtml`)
 * bilan kutib turadi va M2-02 handler'ni yozib `SCRAPE_QUEUE` ni `RUN_QUEUES` ga qo'shganda
 * qayta ishlanadi. Handler qo'lda ishga tushirilsa hech narsa o'zgartirmaydi (element
 * `pending` holatida qoladi).
 */
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
  handler: async ({ job, req }) => {
    req.payload.logger.info({
      msg: 'scrapeItem: stub (M2-02 da fetch/extract qo‘shiladi)',
      scrapedItemId: job.input.scrapedItemId,
    })
  },
}
