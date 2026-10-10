import type { JobsConfig } from 'payload'

import { isAdminUser } from '@/access'
import type { Env } from '@/env'
import { runTelegramDigests } from '@/telegram/digest'

import { DEFAULT_BATCH_LIMIT } from './constants'
import { runAlertChecks } from './alerts'
import { runNewItemsNotification } from './newItemsNotify'
import { runPublishJobs } from './runner'
import { activeRunQueues } from './scrapeDeps'
import { ensureScheduledPublishJobs } from './scheduledPublish'
import { enqueueDailyCleanup, enqueueDueFeedPolls, releaseStaleJobs } from './scheduler'
import { withErrorCapture } from './sentry'
import { feedPollTask } from './tasks/feedPoll'
import { indexNowSubmitTask } from './tasks/indexNowSubmit'
import { itemClassifyTask } from './tasks/itemClassify'
import { itemDedupeTask } from './tasks/itemDedupe'
import { itemExtractTask } from './tasks/itemExtract'
import { itemFetchTask } from './tasks/itemFetch'
import { maintenanceCleanupTask } from './tasks/maintenanceCleanup'
import { makeWebhookTask } from './tasks/makeWebhook'
import { telegramDigestEditTask } from './tasks/telegramDigestEdit'
import { telegramPostTask } from './tasks/telegramPost'
import { scrapeItemWorkflow } from './workflows/scrapeItem'

/** `autorun` tick'ida (har daqiqa) nashr bosqichi uchun vaqt — qolgani keyingi tick'da. */
const AUTORUN_PUBLISH_DEADLINE_MS = 45_000

/**
 * Payload Jobs registri (TZ §3.5, §10.14).
 *
 * `JOBS_MODE` (TZ §3.7.3) — scheduler tanlovi, kod bir xil:
 * - `endpoint` (Vercel): job'larni tashqi scheduler ishga tushiradi — Supabase pg_cron + pg_net:
 *   har 10 daqiqada `POST /api/jobs/run?mode=publish` (nashr), har 30 daqiqada `?mode=scrape`
 *   (yangiliklar) — `infra/supabase/cron.sql`, OBLOG-110; zaxira — GitHub Actions
 *   (`.github/workflows/jobs-fallback.yml`). Serverless'da `autoRun` ishlatilmaydi.
 * - `autorun` (Contabo worker, doimiy jarayon): Payload har daqiqada o'zi ishga tushiradi;
 *   har tick oldidan nashr job'lari ketma-ket bajariladi va muddati kelgan `feed.poll` lar
 *   navbatga qo'yiladi.
 *
 * Task'lar: `feed.poll` (M2-01), `item.fetch` + `item.extract` (`scrapeItem` workflow, M2-02),
 * `item.dedupe` + `item.classify` (workflow davomi) va `maintenance.cleanup` (kuniga 1 marta),
 * ogohlantirishlar — har scheduler chaqiruvida (M2-03), `telegram.post` — post chop etilganda
 * (`default` navbati, M3-01; rejim `post`/"Tezkor"), Telegram dayjesti — nashr tick'ida slot vaqti
 * kelganda, `telegram.digestEdit` — dayjestdagi post tahrirlanganda (OBLOG-116), `indexnow.submit` — publish/unpublish/slug o'zgarishida (OBLOG-57),
 * `make.webhook` — birinchi chop etishda Make.com webhook'iga (OBLOG-91). `schedulePublish` —
 * Payload'ning rejalashtirilgan nashri (`default` navbati); job'i yo'qolgan/xato bergan
 * rejalashtirilgan postlar har chaqiruvda qayta navbatga qo'yiladi (`./scheduledPublish.ts`, OBLOG-100).
 * Task xatolari Sentry'ga ham yuboriladi (`./sentry.ts`, OBLOG-23).
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
      telegramPostTask,
      telegramDigestEditTask,
      indexNowSubmitTask,
      makeWebhookTask,
    ].map(withErrorCapture),
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
            await ensureScheduledPublishJobs(payload)
            // Nashr — scraping'dan oldin va ketma-ket (OBLOG-110), endpoint rejimi bilan bir xil.
            await runPublishJobs(payload.jobs, { deadlineMs: AUTORUN_PUBLISH_DEADLINE_MS })
            // Telegram dayjesti (OBLOG-116) — slot vaqti kelgan bo'lsa (xato tick'ni to'xtatmaydi).
            await runTelegramDigests(payload).catch((error: unknown) => {
              payload.logger.error({ err: error, msg: 'Telegram dayjest bosqichi xatosi' })
            })
            await enqueueDueFeedPolls(payload)
            await enqueueDailyCleanup(payload)
            await runAlertChecks(payload)
            // Oldingi tick'larda (daqiqa oldin) yig'ilganlar — bitta xabar (OBLOG-55).
            await runNewItemsNotification(payload)
            return true
          },
        }
      : {}),
  }
}
