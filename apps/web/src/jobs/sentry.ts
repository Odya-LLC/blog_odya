import { captureError } from '@/lib/sentry'

/**
 * Job task xatolari → Sentry (TZ §9.4 "jobs", OBLOG-23).
 *
 * Payload task xatosini o'zi ushlab, job'ga yozadi (retry/backoff) — tashqariga chiqmaydi,
 * shuning uchun handler o'raladi: xato Sentry'ga yuboriladi va o'zgarishsiz qayta otiladi
 * (retry mantiqi saqlanadi). Bekor qilingan job (`JobCancelledError`) — xato emas.
 * `SENTRY_DSN` bo'lmasa — oddiy o'tkazib yuborish.
 */
type TaskHandlerArgs = {
  job?: { id?: number | string; totalTried?: number | null; queue?: string | null }
}
type AnyHandler = (args: TaskHandlerArgs) => unknown

export function withErrorCapture<T extends { slug: string; handler: unknown }>(task: T): T {
  const handler = task.handler
  if (typeof handler !== 'function') return task
  const run = handler as AnyHandler
  const wrapped: AnyHandler = async (args) => {
    try {
      return await run(args)
    } catch (error) {
      if (!(error instanceof Error && error.name === 'JobCancelledError')) {
        captureError(error, {
          tags: { job_task: task.slug, job_queue: args.job?.queue ?? undefined },
          extra: { jobId: args.job?.id, totalTried: args.job?.totalTried },
        })
      }
      throw error
    }
  }
  return { ...task, handler: wrapped }
}
