/**
 * Sentry (TZ §9.4, OBLOG-23) — server tomoni: sozlamalar va yordamchilar.
 *
 * `SENTRY_DSN` bo'lmasa Sentry butunlay o'chiq: SDK ishga tushirilmaydi (`src/instrumentation.ts`),
 * `captureError` / `flushSentry` hech narsa qilmaydi. Faqat xatolar yuboriladi (tracing yo'q —
 * bepul kvotani tejash), shaxsiy ma'lumotlar (IP, cookie) yuborilmaydi.
 *
 * Qo'llanma va sun'iy xato bilan tekshirish: `docs/runbooks/monitoring.md`.
 */
import * as Sentry from '@sentry/nextjs'

type RawEnv = Record<string, string | undefined>

export function sentryDsn(source: RawEnv = process.env): string | undefined {
  return source.SENTRY_DSN?.trim() || undefined
}

export function isSentryEnabled(source: RawEnv = process.env): boolean {
  return Boolean(sentryDsn(source))
}

/** Sentry `environment`: Vercel'da `production` / `preview`, aks holda `NODE_ENV`. */
export function sentryEnvironment(source: RawEnv = process.env): string {
  return source.VERCEL_ENV || source.NODE_ENV || 'development'
}

/** `Sentry.init` parametrlari (Node.js va edge runtime uchun umumiy). */
export function sentryServerOptions(source: RawEnv = process.env) {
  return {
    dsn: sentryDsn(source),
    environment: sentryEnvironment(source),
    // Release — `VERCEL_GIT_COMMIT_SHA` (SDK o'zi oladi; source map'lar ham shu release'ga).
    sendDefaultPii: false,
    // Faqat xatolar: performance tracing o'chiq.
    tracesSampleRate: 0,
  }
}

export interface CaptureContext {
  tags?: Record<string, string | number | boolean | undefined>
  extra?: Record<string, unknown>
}

/** Xatoni Sentry'ga yuboradi (o'chiq bo'lsa — hech narsa). Event ID yoki `undefined`. */
export function captureError(error: unknown, context: CaptureContext = {}): string | undefined {
  if (!isSentryEnabled()) return undefined
  const tags = Object.fromEntries(
    Object.entries(context.tags ?? {}).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean>
  return Sentry.captureException(error, { tags, extra: context.extra })
}

/**
 * Serverless'da javobdan keyin funksiya muzlatilishi mumkin — navbatdagi event'larni yuborib
 * olish (ko'pi bilan `timeoutMs`).
 */
export async function flushSentry(timeoutMs = 2_000): Promise<void> {
  if (!isSentryEnabled()) return
  try {
    await Sentry.flush(timeoutMs)
  } catch {
    // Monitoring xatosi asosiy javobni buzmasin.
  }
}

/**
 * Payload REST/GraphQL xatolari (`hooks.afterError`): Payload ularni o'zi javobga aylantiradi
 * (`onRequestError` ko'rmaydi). Faqat server xatolari (5xx / statussiz) — 4xx (validatsiya,
 * 401/403/404) Sentry'ni to'ldirmasin.
 */
export function capturePayloadError({
  error,
  collection,
  req,
}: {
  error: Error
  collection?: { slug: string }
  req?: { url?: string; method?: string }
}): void {
  const status = (error as { status?: unknown }).status
  if (typeof status === 'number' && status < 500) return
  captureError(error, {
    tags: { source: 'payload', collection: collection?.slug, method: req?.method },
    extra: { url: req?.url },
  })
}
