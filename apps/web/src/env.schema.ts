/**
 * Muhit o'zgaruvchilari sxemasi (TZ §3.7.3). Barcha tashqi bog'liqliklar faqat env orqali
 * ulanadi — lokal (Docker: Postgres + MinIO), Vercel + Supabase + R2 va Contabo o'rtasidagi
 * farq faqat shu qiymatlarda.
 *
 * Bu modul yon ta'sirsiz (faqat sxema va funksiyalar) — `next.config.ts` uni build fazasini
 * bilgan holda chaqiradi. Ilova kodi `@/env` dan tayyor `env` obyektini oladi.
 *
 * Tekshiruv darajalari (`resolveEnvMode`):
 * - `strict` — runtime (`next start`, Vercel funksiyalari, `next dev`, testlar):
 *   barcha majburiy qiymatlar bo'lishi shart, aks holda ilova ishga tushmaydi.
 * - `migrate` — `pnpm migrate*` (`PAYLOAD_MIGRATING=true`): faqat DB majburiy. Migratsiya S3 ga
 *   ulanmaydi va hech narsani imzolamaydi, shuning uchun `PAYLOAD_SECRET` va `S3_*` ixtiyoriy
 *   (prod migratsiya workflow'i — `.github/workflows/migrate-prod.yml` — faqat DB sirini oladi).
 *   Berilgan qiymatlar baribir format bo'yicha tekshiriladi.
 * - `build`  — `next build` (Next.js fazasi `phase-production-build`): build DB/S3 ga ulanmaydi
 *   va sirlarni ishlatmaydi, shuning uchun hech narsa majburiy emas; berilgan qiymatlar baribir
 *   format bo'yicha tekshiriladi. Majburiy qiymatlar runtime'da tekshiriladi.
 * - `skip`   — `SKIP_ENV_VALIDATION=1`: umuman tekshirmaydi.
 *
 * Izohlar va namunaviy qiymatlar: `apps/web/.env.example`.
 */
import { z } from 'zod'

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, 'postgres:// yoki postgresql:// bilan boshlanishi kerak')

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1')

const nonEmpty = z.string().min(1)

/** Standart limit qiymatlari (OBLOG-45): env berilmasa yoki `0` bo'lsa — shular. */
export const DEFAULT_API_KEY_RATE_LIMIT_PER_MIN = 60
export const DEFAULT_MCP_MEDIA_UPLOADS_PER_HOUR = 30
/** `upload_media(url)` timeout'lari (OBLOG-46), ms: tanani o'qish va ulanish + birinchi javob. */
export const DEFAULT_MCP_MEDIA_FETCH_TIMEOUT_MS = 45_000
export const DEFAULT_MCP_MEDIA_CONNECT_TIMEOUT_MS = 10_000

/**
 * Limit uchun musbat butun son. Berilmagan, bo'sh yoki `0` — standart qiymat (limitni env orqali
 * tasodifan o'chirib qo'yib bo'lmaydi); manfiy/kasr/matn — xato. Limitsiz — faqat `admin` roli.
 */
const positiveLimit = (fallback: number) =>
  z.preprocess(
    (value) =>
      value === undefined || value === '' || value === '0' || value === 0 ? undefined : value,
    z.coerce
      .number()
      .int('butun son bo‘lishi kerak')
      .positive('musbat son bo‘lishi kerak')
      .default(fallback),
  )

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // --- Ma'lumotlar bazasi (Postgres) ---
  /** Runtime ulanish (Supabase'da — Supavisor transaction pooler, port 6543). */
  DATABASE_URL: postgresUrl,
  /** Migratsiyalar uchun direct/session ulanish. Bo'lmasa — DATABASE_URL ishlatiladi. */
  DATABASE_URL_DIRECT: postgresUrl.optional(),

  // --- Payload ---
  /** JWT/cookie imzolash siri, kamida 32 belgi (`openssl rand -hex 32`). */
  PAYLOAD_SECRET: z.string().min(32, 'kamida 32 belgi bo‘lishi kerak'),

  // --- S3-mos saqlash (lokal: MinIO, production: Cloudflare R2) ---
  S3_ENDPOINT: z.url(),
  S3_BUCKET: nonEmpty,
  S3_ACCESS_KEY_ID: nonEmpty,
  S3_SECRET_ACCESS_KEY: nonEmpty,
  /** R2 uchun `auto`, MinIO uchun `us-east-1`. */
  S3_REGION: nonEmpty.default('auto'),
  /** MinIO va R2 uchun `true`. */
  S3_FORCE_PATH_STYLE: booleanString.default(false),
  /**
   * Scraping arxivi (raw/clean HTML, gzip) uchun **yopiq** bucket (TZ §3.5; R2: `blog-odya-raw`,
   * lifecycle 30 kun). Bo'lmasa `scrapeItem` navbati ishga tushirilmaydi — job'lar kutib turadi.
   */
  S3_RAW_BUCKET: nonEmpty.optional(),
  /** Media fayllarning ommaviy URL'i (masalan, https://media.odya.uz). Bo'lmasa — Payload orqali beriladi. */
  MEDIA_PUBLIC_URL: z.url().optional(),

  // --- Sayt ---
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),

  // --- Fon vazifalar (Payload Jobs) ---
  /** `endpoint` — pg_cron `/api/jobs/run` ni chaqiradi (Vercel); `autorun` — doimiy worker (Contabo). */
  JOBS_MODE: z.enum(['endpoint', 'autorun']).default('endpoint'),
  /** `/api/jobs/run` uchun Bearer token (32+ belgi). Bo'lmasa endpoint yopiq (503). docs/runbooks/jobs-scheduler.md */
  JOBS_SECRET: z.string().min(32, 'kamida 32 belgi bo‘lishi kerak').optional(),

  // --- Telegram (ixtiyoriy: bo'lmasa avtopost va ogohlantirishlar o'chiq, faqat log) ---
  TELEGRAM_BOT_TOKEN: nonEmpty.optional(),
  TELEGRAM_CHANNEL_LATN: nonEmpty.optional(),
  TELEGRAM_CHANNEL_CYRL: nonEmpty.optional(),
  TELEGRAM_ALERT_CHAT_ID: nonEmpty.optional(),

  // --- Stok rasmlar (ixtiyoriy: bo'lmasa MCP `search_stock_images` "sozlanmagan" deydi) ---
  /** Pexels API kaliti (https://www.pexels.com/api/) — MCP orqali legal rasm qidirish (OBLOG-44). */
  PEXELS_API_KEY: nonEmpty.optional(),

  // --- API kalit va MCP limitlari (OBLOG-45; admin roli uchun qo'llanmaydi) ---
  /** Bitta API kalit uchun daqiqasiga so'rovlar (REST, GraphQL, MCP). Standart — 60. */
  API_KEY_RATE_LIMIT_PER_MIN: positiveLimit(DEFAULT_API_KEY_RATE_LIMIT_PER_MIN),
  /** MCP `upload_media`: bitta foydalanuvchi uchun soatiga yuklashlar. Standart — 30. */
  MCP_MEDIA_UPLOADS_PER_HOUR: positiveLimit(DEFAULT_MCP_MEDIA_UPLOADS_PER_HOUR),
  /**
   * MCP `upload_media(url)`: rasm tanasini o'qish uchun timeout, ms (OBLOG-46). Standart — 45000.
   * Umumiy yuklab olish byudjeti baribir ≤ 90 s (`media-fetch.ts`, route `maxDuration`).
   */
  MCP_MEDIA_FETCH_TIMEOUT_MS: positiveLimit(DEFAULT_MCP_MEDIA_FETCH_TIMEOUT_MS),
  /** MCP `upload_media(url)`: DNS + ulanish + javob sarlavhalari (har redirect uchun), ms. Standart — 10000. */
  MCP_MEDIA_CONNECT_TIMEOUT_MS: positiveLimit(DEFAULT_MCP_MEDIA_CONNECT_TIMEOUT_MS),

  // --- Monitoring (ixtiyoriy: bo'lmasa Sentry o'chiq) ---
  SENTRY_DSN: z.url().optional(),
})

export type Env = z.infer<typeof envSchema>

export interface ApiLimits {
  apiKeyPerMin: number
  mediaUploadsPerHour: number
  mediaFetchTimeoutMs: number
  mediaConnectTimeoutMs: number
}

/**
 * Limitlarni to'g'ridan-to'g'ri `process.env` dan o'qish — `@/env` ni import qilmaydigan
 * modullar (jarayon bo'yicha umumiy limiter'lar) uchun. Noto'g'ri qiymat — standart
 * (to'liq tekshiruv va tushunarli xato — `parseEnv`, ilova ishga tushganda).
 */
export function limitsFromEnv(source: RawEnv = process.env): ApiLimits {
  const read = (name: string, fallback: number) => {
    const parsed = positiveLimit(fallback).safeParse(source[name]?.trim())
    return parsed.success ? parsed.data : fallback
  }
  return {
    apiKeyPerMin: read('API_KEY_RATE_LIMIT_PER_MIN', DEFAULT_API_KEY_RATE_LIMIT_PER_MIN),
    mediaUploadsPerHour: read('MCP_MEDIA_UPLOADS_PER_HOUR', DEFAULT_MCP_MEDIA_UPLOADS_PER_HOUR),
    mediaFetchTimeoutMs: read('MCP_MEDIA_FETCH_TIMEOUT_MS', DEFAULT_MCP_MEDIA_FETCH_TIMEOUT_MS),
    mediaConnectTimeoutMs: read(
      'MCP_MEDIA_CONNECT_TIMEOUT_MS',
      DEFAULT_MCP_MEDIA_CONNECT_TIMEOUT_MS,
    ),
  }
}

type RawEnv = Record<string, string | undefined>

/** Bo'sh satrlar (`FOO=`) "berilmagan" deb hisoblanadi. */
function withoutEmptyValues(source: RawEnv): RawEnv {
  const result: RawEnv = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') result[key] = value
  }
  return result
}

/** `next build` fazasi (`next/constants` → `PHASE_PRODUCTION_BUILD`). */
export const PHASE_PRODUCTION_BUILD = 'phase-production-build'

export type EnvMode = 'strict' | 'build' | 'migrate' | 'skip'

/** Migratsiya uchun shart bo'lmagan (faqat runtime'da kerak) majburiy maydonlar. */
const NOT_REQUIRED_FOR_MIGRATION = {
  PAYLOAD_SECRET: true,
  S3_ENDPOINT: true,
  S3_BUCKET: true,
  S3_ACCESS_KEY_ID: true,
  S3_SECRET_ACCESS_KEY: true,
} as const

/** `pnpm migrate*` skriptlari o'rnatadi (`apps/web/package.json`). */
export function isMigrating(source: RawEnv = process.env): boolean {
  return source.PAYLOAD_MIGRATING === 'true'
}

export function isEnvValidationSkipped(source: RawEnv = process.env): boolean {
  const flag = source.SKIP_ENV_VALIDATION
  return flag === '1' || flag === 'true'
}

/**
 * Tekshiruv darajasini aniqlaydi. `phase` — Next.js `next.config.ts` ga uzatadigan faza; berilmasa
 * `NEXT_PHASE` ishlatiladi (Next.js uni build'ning "Collecting page data" / "Generating static
 * pages" bosqichlarida o'rnatadi — shu paytda route modullari `payload.config` ni import qiladi).
 */
export function resolveEnvMode(source: RawEnv = process.env, phase?: string): EnvMode {
  if (isEnvValidationSkipped(source)) return 'skip'
  if ((phase ?? source.NEXT_PHASE) === PHASE_PRODUCTION_BUILD) return 'build'
  if (isMigrating(source)) return 'migrate'
  return 'strict'
}

function envError(error: z.ZodError, mode: EnvMode): Error {
  const where = mode === 'build' || mode === 'migrate' ? ` (${mode})` : ''
  return new Error(
    `Muhit o'zgaruvchilari noto'g'ri${where} (apps/web/.env.example ga qarang):\n${z.prettifyError(error)}`,
  )
}

/**
 * Env'ni tekshiradi va turlangan obyekt qaytaradi; xato bo'lsa tushunarli xabar bilan otiladi.
 *
 * `build` va `skip` rejimlarida majburiy maydonlar `undefined` bo'lishi mumkin — ular faqat
 * runtime'da ishlatiladi (Payload build vaqtida DB/S3 ga ulanmaydi). `migrate` rejimida
 * `PAYLOAD_SECRET` va `S3_*` `undefined` bo'lishi mumkin (`getPayloadSecret`, S3 plagini o'chiq).
 */
export function parseEnv(source: RawEnv = process.env, mode = resolveEnvMode(source)): Env {
  const cleaned = withoutEmptyValues(source)

  if (mode === 'skip') {
    // Tekshiruvsiz rejim: mavjud qiymatlar formatini tekshirmasdan, default'larni qo'llab qaytaramiz.
    const partial = envSchema.partial().safeParse(cleaned)
    return (partial.success ? partial.data : cleaned) as Env
  }

  if (mode === 'build') {
    // Build: hech narsa majburiy emas, lekin berilgan qiymatlar formati to'g'ri bo'lishi kerak.
    const partial = envSchema.partial().safeParse(cleaned)
    if (!partial.success) throw envError(partial.error, mode)
    return partial.data as Env
  }

  if (mode === 'migrate') {
    // Migratsiya: faqat DB majburiy; PAYLOAD_SECRET va S3_* — ixtiyoriy (format tekshiriladi).
    const parsed = envSchema.partial(NOT_REQUIRED_FOR_MIGRATION).safeParse(cleaned)
    if (!parsed.success) throw envError(parsed.error, mode)
    return parsed.data as Env
  }

  const parsed = envSchema.safeParse(cleaned)
  if (!parsed.success) throw envError(parsed.error, mode)
  return parsed.data
}
