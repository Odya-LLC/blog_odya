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
  /** `/api/jobs/run` uchun Bearer token (32+ belgi). Bo'lmasa endpoint yopiq (503). docs/runbooks/jobs-scheduler.md */
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
