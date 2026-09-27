/**
 * Brauzer Sentry SDK'si — faqat kerak bo'lganda dinamik yuklanadi (`src/instrumentation-client.ts`).
 * Nomli import'lar: bundler faqat ishlatilgan qismlarni oladi (butun `@sentry/nextjs` emas).
 */
import { captureException, captureRouterTransitionStart, init } from '@sentry/nextjs'

export { captureException, captureRouterTransitionStart }

export function initClientSentry(dsn: string): void {
  init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  })
}
