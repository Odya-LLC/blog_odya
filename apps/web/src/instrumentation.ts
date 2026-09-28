import * as Sentry from '@sentry/nextjs'

/**
 * Next.js instrumentation (OBLOG-23, TZ §9.4): Sentry — Node.js va edge runtime'lari.
 * `SENTRY_DSN` bo'lmasa SDK ishga tushirilmaydi.
 */
export async function register(): Promise<void> {
  if (!process.env.SENTRY_DSN) return
  const { sentryServerOptions } = await import('./lib/sentry')
  Sentry.init(sentryServerOptions())
}

/** Server Component, route handler, Server Action va proxy xatolari → Sentry. */
export const onRequestError = Sentry.captureRequestError
