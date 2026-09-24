import type { JobsConfig } from 'payload'

import { isAdminUser } from '@/access'
import type { Env } from '@/env'

import { DEFAULT_BATCH_LIMIT } from './constants'
import { runAlertChecks } from './alerts'
import { activeRunQueues } from './scrapeDeps'
import { enqueueDailyCleanup, enqueueDueFeedPolls, releaseStaleJobs } from './scheduler'
import { feedPollTask } from './tasks/feedPoll'
import { itemClassifyTask } from './tasks/itemClassify'
import { itemDedupeTask } from './tasks/itemDedupe'
import { itemExtractTask } from './tasks/itemExtract'
import { itemFetchTask } from './tasks/itemFetch'
import { maintenanceCleanupTask } from './tasks/maintenanceCleanup'
import { scrapeItemWorkflow } from './workflows/scrapeItem'

/**
 * Payload Jobs registri (TZ §3.5, §10.14).
 *
 * `JOBS_MODE` (TZ §3.7.3) — scheduler tanlovi, kod bir xil:
 * - `endpoint` (Vercel): job'larni tashqi scheduler ishga tushiradi — Supabase pg_cron + pg_net
 *   har 10 daqiqada `POST /api/jobs/run` (`infra/supabase/cron.sql`), zaxira — GitHub Actions
 *   (`.github/workflows/jobs-fallback.yml`). Serverless'da `autoRun` ishlatilmaydi.
 * - `autorun` (Contabo worker, doimiy jarayon): Payload har daqiqada o'zi ishga tushiradi;
 *   har tick oldidan muddati kelgan `feed.poll` lar navbatga qo'yiladi.
 *
 * Task'lar: `feed.poll` (M2-01), `item.fetch` + `item.extract` (`scrapeItem` workflow, M2-02),
 * `item.dedupe` + `item.classify` (workflow davomi) va `maintenance.cleanup` (kuniga 1 marta),
 * ogohlantirishlar — har scheduler chaqiruvida (M2-03).
 */
export function buildJobsConfig(mode: Env['JOBS_MODE'] = 'endpoint'): JobsConfig {
  const adminOnly = ({ req }: { req: { user?: unknown } }) =>
    isAdminUser(req.user as Parameters<typeof isAdminUser>[0])

  return {
    tasks: [
      feedPollTask,
      itemFetchTask,
      itemExtractTask,
      itemDedupeTask,
      itemClassifyTask,
      maintenanceCleanupTask,
    ],
    workflows: [scrapeItemWorkflow],
    // Supabase Free 500 MB: muvaffaqiyatli job'lar saqlanmaydi (natija — manba `stats` da).
    deleteJobOnComplete: true,
    // Payload'ning o'z `/api/payload-jobs/run|queue|cancel` endpoint'lari — faqat admin.
    access: { run: adminOnly, queue: adminOnly, cancel: adminOnly },
    ...(mode === 'autorun'
      ? {
          // `default` + `scrape` (ikkinchisi — faqat arxiv, S3_RAW_BUCKET sozlangan bo'lsa).
          autoRun: activeRunQueues().map((queue) => ({
            cron: '* * * * *',
            queue,
            limit: DEFAULT_BATCH_LIMIT,
          })),
          shouldAutoRun: async (payload) => {
            await releaseStaleJobs(payload)
            await enqueueDueFeedPolls(payload)
            await enqueueDailyCleanup(payload)
            await runAlertChecks(payload)
            return true
          },
        }
      : {}),
  }
}
