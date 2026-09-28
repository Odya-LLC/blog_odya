/**
 * Brauzer Sentry'si (OBLOG-23, TZ §9.4). DSN — `NEXT_PUBLIC_SENTRY_DSN` (build vaqtida
 * bundle'ga yoziladi; berilmasa `next.config.ts` `SENTRY_DSN` ni oladi). DSN bo'lmasa — hech
 * narsa qilinmaydi.
 *
 * SDK **birinchi xato sodir bo'lganda** yuklanadi (`src/lib/sentry-client.ts`, alohida chunk):
 * oddiy sahifa ko'rishda brauzerga Sentry kodi umuman kelmaydi — birinchi yuklash JS byudjeti
 * (≤ 150 KB gzip, TZ §8.4) va Lighthouse o'zgarmaydi. Shu paytgacha ushlangan xatolar SDK
 * yuklangach yuboriladi; keyingilarini SDK'ning o'z global handler'lari ushlaydi.
 * Cheklov: xatodan oldingi breadcrumb'lar yo'q; error boundary (`error.tsx`) ushlagan xatolar
 * global hodisaga chiqmaydi — ular server tomonida (`onRequestError`) yoziladi.
 */
type SentryClient = typeof import('./lib/sentry-client')

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
let sentry: SentryClient | null = null
let loading = false
const pending: unknown[] = []

function capture(error: unknown): void {
  // SDK yuklangan — xatolarni uning global handler'lari o'zi yuboradi (takror bo'lmasin).
  if (sentry || !dsn) return
  pending.push(error)
  if (loading) return
  loading = true
  void import('./lib/sentry-client').then((client) => {
    client.initClientSentry(dsn)
    sentry = client
    for (const item of pending.splice(0)) client.captureException(item)
  })
}

if (dsn && typeof window !== 'undefined') {
  window.addEventListener('error', (event) => capture(event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => capture(event.reason))
}

/** Next.js navigatsiya hook'i — SDK yuklangan bo'lsa Sentry'ga uzatiladi. */
export function onRouterTransitionStart(
  ...args: Parameters<SentryClient['captureRouterTransitionStart']>
): void {
  sentry?.captureRouterTransitionStart(...args)
}
