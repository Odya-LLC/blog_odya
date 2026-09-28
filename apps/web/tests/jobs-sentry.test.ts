import { afterEach, describe, expect, it, vi } from 'vitest'

const captureException = vi.fn(() => 'event-id')
vi.mock('@sentry/nextjs', () => ({ captureException, flush: vi.fn(async () => true) }))

const { withErrorCapture } = await import('@/jobs/sentry')
const { capturePayloadError } = await import('@/lib/sentry')

/** Job task va Payload xatolari → Sentry (OBLOG-23, TZ §9.4). */
describe('Sentry: jobs va Payload xatolari', () => {
  afterEach(() => {
    captureException.mockClear()
    vi.unstubAllEnvs()
  })

  const failing = {
    slug: 'feed.poll',
    handler: async () => {
      throw new Error('feed 500')
    },
  }

  it('DSN bor — xato yuboriladi va qayta otiladi (retry saqlanadi)', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://k@o1.ingest.sentry.io/1')
    const task = withErrorCapture(failing)
    const handler = task.handler as (args: object) => Promise<unknown>
    await expect(handler({ job: { id: 7, queue: 'default', totalTried: 1 } })).rejects.toThrow(
      'feed 500',
    )
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { job_task: 'feed.poll', job_queue: 'default' },
      extra: { jobId: 7, totalTried: 1 },
    })
  })

  it('DSN yo‘q — hech narsa yuborilmaydi; muvaffaqiyatli task o‘zgarmaydi', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    const handler = withErrorCapture(failing).handler as (args: object) => Promise<unknown>
    await expect(handler({})).rejects.toThrow('feed 500')
    expect(captureException).not.toHaveBeenCalled()

    const ok = withErrorCapture({ slug: 'x', handler: async () => ({ output: { n: 1 } }) })
    expect(await (ok.handler as (args: object) => Promise<unknown>)({})).toEqual({
      output: { n: 1 },
    })
  })

  it('bekor qilingan job — xato emas', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://k@o1.ingest.sentry.io/1')
    const cancelled = Object.assign(new Error('cancelled'), { name: 'JobCancelledError' })
    const handler = withErrorCapture({
      slug: 'x',
      handler: async () => {
        throw cancelled
      },
    }).handler as (args: object) => Promise<unknown>
    await expect(handler({})).rejects.toBe(cancelled)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('Payload afterError: faqat 5xx', () => {
    vi.stubEnv('SENTRY_DSN', 'https://k@o1.ingest.sentry.io/1')
    capturePayloadError({ error: Object.assign(new Error('Not Found'), { status: 404 }) })
    capturePayloadError({ error: Object.assign(new Error('Forbidden'), { status: 403 }) })
    expect(captureException).not.toHaveBeenCalled()
    capturePayloadError({
      error: new Error('db down'),
      collection: { slug: 'posts' },
      req: { method: 'GET', url: '/api/posts' },
    })
    expect(captureException).toHaveBeenCalledOnce()
  })
})
