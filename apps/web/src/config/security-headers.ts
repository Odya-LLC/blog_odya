/**
 * Security headers (TZ §9.2, OBLOG-23) — `next.config.ts` `headers()` shu yerdan oladi.
 *
 * Ikkita CSP:
 * - **sayt** (barcha yo'llar): Next.js inline skriptlari (RSC payload, tema skripti) nonce'siz
 *   — shuning uchun `script-src 'unsafe-inline'` (nonce sahifalarni dinamik qilib, ISR keshini
 *   buzardi). Ruxsat etilgan tashqi manbalar: media domeni (`MEDIA_PUBLIC_URL`), GA4, Yandex
 *   Metrica, YouTube (nocookie), X (Twitter) va Telegram embed'lari, Sentry, Vercel preview.
 * - **admin** (`/admin`, GraphQL playground): Payload admin'i inline stil/skript, `blob:`/`data:`,
 *   Monaco (code/JSON maydonlari — jsDelivr CDN) va bucket'ga to'g'ridan-to'g'ri yuklash
 *   (`clientUploads` → `S3_ENDPOINT`, R2) kerak. Admin o'zini iframe qilishi mumkin
 *   (`SAMEORIGIN`), sayt esa hech kimga iframe'da ko'rsatilmaydi (`DENY`).
 *
 * Qiymatlar build vaqtida hisoblanadi (Vercel'da `next.config` faqat build'da bajariladi) —
 * env o'zgarsa qayta deploy kerak.
 */

type RawEnv = Record<string, string | undefined>

export interface SecurityHeadersOptions {
  /** `next dev`: React dev (`eval`) va HMR websocket uchun yumshatiladi. */
  dev?: boolean
}

export interface HeaderRule {
  source: string
  headers: Array<{ key: string; value: string }>
}

/** GA4 (gtag.js). Region domenlari: `region1.google-analytics.com`, `*.analytics.google.com`. */
const GA4 = {
  script: ['https://www.googletagmanager.com'],
  connect: [
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    'https://*.googletagmanager.com',
  ],
  img: ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
}

/** Yandex Metrica (`tag.js`): skript, hit'lar, `clickmap`/`webvisor` iframe va websocket. */
const METRICA = {
  script: ['https://mc.yandex.ru', 'https://mc.yandex.com', 'https://yastatic.net'],
  connect: ['https://mc.yandex.ru', 'https://mc.yandex.com', 'wss://mc.yandex.com'],
  img: ['https://mc.yandex.ru', 'https://mc.yandex.com'],
  frame: ['https://mc.yandex.ru', 'https://mc.yandex.com'],
}

/** Lexical embed'lari (`src/components/richtext`): YouTube facade, X widgets.js, Telegram widget. */
const EMBEDS = {
  script: [
    'https://platform.twitter.com',
    'https://cdn.syndication.twimg.com',
    'https://telegram.org',
  ],
  connect: ['https://cdn.syndication.twimg.com', 'https://syndication.twitter.com'],
  img: [
    'https://i.ytimg.com',
    'https://pbs.twimg.com',
    'https://abs.twimg.com',
    'https://syndication.twitter.com',
    'https://telegram.org',
  ],
  style: ['https://platform.twitter.com'],
  frame: [
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
    'https://platform.twitter.com',
    'https://syndication.twitter.com',
    'https://t.me',
    'https://telegram.org',
  ],
}

/** Sentry ingest (DSN host'i `o123.ingest.us.sentry.io` — `*.sentry.io` ko'p darajali mos keladi). */
const SENTRY = ['https://*.sentry.io']

/** Vercel Preview toolbar / izohlar (faqat `VERCEL_ENV=preview`). */
const VERCEL_LIVE = ['https://vercel.live', 'https://*.pusher.com', 'wss://*.pusher.com']

/** Cloudflare R2 S3 API (admin `clientUploads` — imzolangan URL bilan PUT). */
const R2_API = 'https://*.r2.cloudflarestorage.com'

/** Monaco editor (Payload `code`/`json` maydonlari) jsDelivr CDN'dan yuklanadi. */
const MONACO_CDN = 'https://cdn.jsdelivr.net'

export function originOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    const { origin } = new URL(url)
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

function unique(values: Array<string | null | undefined | false>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function serialize(directives: Record<string, Array<string | null | undefined | false>>): string {
  return Object.entries(directives)
    .map(([name, values]) => [name, ...unique(values)].join(' '))
    .join('; ')
}

/**
 * Media fayllar manbalari: `MEDIA_PUBLIC_URL` (production — R2 domeni) va sayt origin'i
 * (`NEXT_PUBLIC_SITE_URL`). `MEDIA_PUBLIC_URL` bo'lmasa Payload fayllarni `/api/media/file/…`
 * orqali **absolyut** URL bilan beradi (`serverURL` = `NEXT_PUBLIC_SITE_URL`), va u sahifa
 * ochilgan origin'dan farq qilishi mumkin (Vercel preview `*.vercel.app` ↔ kanonik domen, CI
 * `next start -p 3100` ↔ `localhost:3000`) — `'self'` yetmaydi.
 */
function mediaSources(env: RawEnv): Array<string | null> {
  return [originOf(env.MEDIA_PUBLIC_URL), originOf(env.NEXT_PUBLIC_SITE_URL)]
}

function isHttps(env: RawEnv): boolean {
  return (env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://')
}

/** Ommaviy sayt CSP'si. */
export function buildSiteCsp(env: RawEnv, options: SecurityHeadersOptions = {}): string {
  const media = mediaSources(env)
  const sentry = [...SENTRY, originOf(env.SENTRY_DSN), originOf(env.NEXT_PUBLIC_SENTRY_DSN)]
  const preview = env.VERCEL_ENV === 'preview' ? VERCEL_LIVE : []
  const dev = options.dev ?? false

  const directives: Record<string, Array<string | null | undefined | false>> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      dev && "'unsafe-eval'",
      ...GA4.script,
      ...METRICA.script,
      ...EMBEDS.script,
      ...preview,
    ],
    'style-src': ["'self'", "'unsafe-inline'", ...EMBEDS.style, ...preview],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      ...media,
      ...GA4.img,
      ...METRICA.img,
      ...EMBEDS.img,
      ...preview,
    ],
    'font-src': ["'self'", 'data:', ...preview],
    'connect-src': [
      "'self'",
      ...media,
      ...GA4.connect,
      ...METRICA.connect,
      ...EMBEDS.connect,
      ...sentry,
      ...preview,
      dev && 'ws:',
    ],
    'media-src': ["'self'", ...media],
    'frame-src': [...EMBEDS.frame, ...METRICA.frame, ...preview],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  if (isHttps(env) && !dev) directives['upgrade-insecure-requests'] = []
  return serialize(directives)
}

/** Payload admin (`/admin`) CSP'si. */
export function buildAdminCsp(env: RawEnv, options: SecurityHeadersOptions = {}): string {
  const media = mediaSources(env)
  const bucket = originOf(env.S3_ENDPOINT)
  const sentry = [...SENTRY, originOf(env.SENTRY_DSN), originOf(env.NEXT_PUBLIC_SENTRY_DSN)]
  const preview = env.VERCEL_ENV === 'preview' ? VERCEL_LIVE : []
  const dev = options.dev ?? false

  const directives: Record<string, Array<string | null | undefined | false>> = {
    'default-src': ["'self'"],
    // Monaco (code/JSON maydonlari) `eval`siz ishlamaydi; Payload admin'i faqat autentifikatsiyadan
    // keyin ochiladi, shuning uchun yumshatish faqat shu yerda (saytda — yo'q).
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'blob:', MONACO_CDN, ...preview],
    'style-src': ["'self'", "'unsafe-inline'", MONACO_CDN, ...preview],
    // Muqova/stok rasm oldindan ko'rish (Pexels, manba sahifalari) — istalgan HTTPS rasm.
    'img-src': ["'self'", 'data:', 'blob:', 'https:', ...media, bucket],
    'font-src': ["'self'", 'data:', MONACO_CDN, ...preview],
    'connect-src': [
      "'self'",
      ...media,
      bucket,
      R2_API,
      MONACO_CDN,
      ...sentry,
      ...preview,
      dev && 'ws:',
    ],
    'media-src': ["'self'", 'blob:', ...media, bucket],
    'frame-src': ["'self'", ...preview],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
  }
  if (isHttps(env) && !dev) directives['upgrade-insecure-requests'] = []
  return serialize(directives)
}

/** YouTube pleyeri (`YouTubeFacade` iframe `allow`) — sensorlar faqat unga beriladi. */
const YOUTUBE_EMBED_ORIGIN = '"https://www.youtube-nocookie.com"'

/**
 * Brauzer API'lari: sayt kamera/mikrofon/geolokatsiya va h.k. ishlatmaydi. `fullscreen`,
 * `autoplay`, `encrypted-media`, `picture-in-picture`, `clipboard-write` — ro'yxatda yo'q
 * (standart: o'zi + iframe `allow` orqali). `accelerometer`/`gyroscope` — faqat YouTube
 * pleyeriga (360° video).
 */
export const PERMISSIONS_POLICY = [
  `accelerometer=(self ${YOUTUBE_EMBED_ORIGIN})`,
  'browsing-topics=()',
  'camera=()',
  'display-capture=()',
  'geolocation=()',
  `gyroscope=(self ${YOUTUBE_EMBED_ORIGIN})`,
  'hid=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'serial=()',
  'usb=()',
  'xr-spatial-tracking=()',
].join(', ')

/** HSTS: 2 yil, subdomenlar bilan (`preload` — domen egasi alohida qaror qiladi). */
export const HSTS = 'max-age=63072000; includeSubDomains'

/**
 * `next.config.ts` `headers()` qoidalari. Bir xil kalit bir nechta qoidaga mos kelsa, Next.js
 * oxirgisini qo'llaydi — shuning uchun admin qoidasi umumiy qoidadan keyin turadi.
 */
export function securityHeaderRules(
  env: RawEnv,
  options: SecurityHeadersOptions = {},
): HeaderRule[] {
  const common = [
    { key: 'Strict-Transport-Security', value: HSTS },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
  ]
  const admin = [
    { key: 'Content-Security-Policy', value: buildAdminCsp(env, options) },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  ]
  return [
    {
      source: '/:path*',
      headers: [
        ...common,
        { key: 'Content-Security-Policy', value: buildSiteCsp(env, options) },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    },
    { source: '/admin', headers: admin },
    { source: '/admin/:path*', headers: admin },
    { source: '/api/graphql-playground', headers: admin },
  ]
}
