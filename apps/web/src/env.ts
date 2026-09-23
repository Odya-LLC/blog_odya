/**
 * Muhit o'zgaruvchilari sxemasi (TZ §3.7.3). Barcha tashqi bog'liqliklar faqat env orqali
 * ulanadi — lokal (Docker: Postgres + MinIO), Vercel + Supabase + R2 va Contabo o'rtasidagi
 * farq faqat shu qiymatlarda.
 *
 * Qiymatlar birinchi import paytida tekshiriladi; xato bo'lsa ilova ishga tushmaydi.
 * `SKIP_ENV_VALIDATION=1` — tekshiruvni o'chiradi (masalan, sirlar yo'q muhitda `next build`).
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
  /** Media fayllarning ommaviy URL'i (masalan, https://media.odya.uz). Bo'lmasa — Payload orqali beriladi. */
  MEDIA_PUBLIC_URL: z.url().optional(),

  // --- Sayt ---
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),

  // --- Fon vazifalar (Payload Jobs) ---
  /** `endpoint` — pg_cron `/api/jobs/run` ni chaqiradi (Vercel); `autorun` — doimiy worker (Contabo). */
  JOBS_MODE: z.enum(['endpoint', 'autorun']).default('endpoint'),
  /** `/api/jobs/run` uchun Bearer token (32+ belgi). Endpoint M2-01 da qo'shiladi; bo'lmasa endpoint yopiq. */
  JOBS_SECRET: z.string().min(32, 'kamida 32 belgi bo‘lishi kerak').optional(),

  // --- Telegram (ixtiyoriy: bo'lmasa avtopost va ogohlantirishlar o'chiq, faqat log) ---
  TELEGRAM_BOT_TOKEN: nonEmpty.optional(),
  TELEGRAM_CHANNEL_LATN: nonEmpty.optional(),
  TELEGRAM_CHANNEL_CYRL: nonEmpty.optional(),
  TELEGRAM_ALERT_CHAT_ID: nonEmpty.optional(),

  // --- Monitoring (ixtiyoriy: bo'lmasa Sentry o'chiq) ---
  SENTRY_DSN: z.url().optional(),
})

export type Env = z.infer<typeof envSchema>

type RawEnv = Record<string, string | undefined>

/** Bo'sh satrlar (`FOO=`) "berilmagan" deb hisoblanadi. */
function withoutEmptyValues(source: RawEnv): RawEnv {
  const result: RawEnv = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') result[key] = value
  }
  return result
}

export function isEnvValidationSkipped(source: RawEnv = process.env): boolean {
  const flag = source.SKIP_ENV_VALIDATION
  return flag === '1' || flag === 'true'
}

/** Env'ni tekshiradi va turlangan obyekt qaytaradi; xato bo'lsa tushunarli xabar bilan otiladi. */
export function parseEnv(source: RawEnv = process.env): Env {
  const cleaned = withoutEmptyValues(source)

  if (isEnvValidationSkipped(source)) {
    // Tekshiruvsiz rejim (faqat build/CI uchun): mavjud qiymatlar formatini tekshirmasdan,
    // default'larni qo'llab qaytaramiz.
    const partial = envSchema.partial().safeParse(cleaned)
    return (partial.success ? partial.data : cleaned) as Env
  }

  const parsed = envSchema.safeParse(cleaned)
  if (!parsed.success) {
    throw new Error(
      `Muhit o'zgaruvchilari noto'g'ri (apps/web/.env.example ga qarang):\n${z.prettifyError(parsed.error)}`,
    )
  }
  return parsed.data
}

export const env: Env = parseEnv()
