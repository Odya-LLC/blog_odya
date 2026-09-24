import type { JobsConfig } from 'payload'

import { isAdminUser } from '@/access'
import type { Env } from '@/env'

import { DEFAULT_BATCH_LIMIT, DEFAULT_QUEUE } from './constants'
import { enqueueDueFeedPolls, releaseStaleJobs } from './scheduler'
import { feedPollTask } from './tasks/feedPoll'
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
 */
export function buildJobsConfig(mode: Env['JOBS_MODE'] = 'endpoint'): JobsConfig {
  const adminOnly = ({ req }: { req: { user?: unknown } }) =>
    isAdminUser(req.user as Parameters<typeof isAdminUser>[0])

  return {
    tasks: [feedPollTask],
    workflows: [scrapeItemWorkflow],
    // Supabase Free 500 MB: muvaffaqiyatli job'lar saqlanmaydi (natija — manba `stats` da).
    deleteJobOnComplete: true,
    // Payload'ning o'z `/api/payload-jobs/run|queue|cancel` endpoint'lari — faqat admin.
    access: { run: adminOnly, queue: adminOnly, cancel: adminOnly },
    ...(mode === 'autorun'
      ? {
          autoRun: [{ cron: '* * * * *', queue: DEFAULT_QUEUE, limit: DEFAULT_BATCH_LIMIT }],
          shouldAutoRun: async (payload) => {
            await releaseStaleJobs(payload)
            await enqueueDueFeedPolls(payload)
            return true
          },
        }
      : {}),
  }
}
