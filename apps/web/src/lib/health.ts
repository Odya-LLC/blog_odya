/**
 * `GET /api/health` (TZ §9.4, §3.7.2; OBLOG-23) — UptimeRobot uchun.
 *
 * DB'ga yengil so'rov (`select 1`) — Supabase Free loyihasini "faol" saqlaydi (7 kun
 * faoliyatsizlikda pauza) va pauza/uzilishni darhol ko'rsatadi: DB javob bermasa — `503`.
 * Javob keshlanmaydi. Mantiq yon ta'sirsiz — testlar `ping` ni almashtiradi.
 */
import packageJson from '../../package.json'

/** DB tekshiruvi uchun umumiy vaqt (Payload sovuq init + `select 1`). UptimeRobot timeout — 30 s. */
export const HEALTH_TIMEOUT_MS = 8_000

export interface HealthBody {
  status: 'ok' | 'error'
  db: 'ok' | 'error'
  /** DB tekshiruvi davomiyligi, ms (sovuq startda Payload init bilan); xato bo'lsa — `null`. */
  dbLatencyMs: number | null
  /** `package.json` versiyasi + commit (Vercel: `VERCEL_GIT_COMMIT_SHA`, 7 belgi). */
  version: string
  time: string
  /** DB xatosi qisqacha (sirlarsiz): `timeout` yoki xato nomi. */
  error?: string
}

export interface HealthDeps {
  /** DB'ga `select 1` (xato yoki osilib qolsa — DB ishlamayapti). */
  ping: () => Promise<void>
  timeoutMs?: number
  now?: () => number
  env?: Record<string, string | undefined>
}

export function appVersion(source: Record<string, string | undefined> = process.env): string {
  const sha = source.VERCEL_GIT_COMMIT_SHA?.trim().slice(0, 7)
  return sha ? `${packageJson.version}+${sha}` : packageJson.version
}

class HealthTimeoutError extends Error {
  constructor() {
    super('timeout')
    this.name = 'timeout'
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HealthTimeoutError()), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Xato nomi (xabar emas — unda host/foydalanuvchi bo'lishi mumkin). */
function errorLabel(error: unknown): string {
  if (error instanceof HealthTimeoutError) return 'timeout'
  const code = (error as { code?: unknown })?.code
  if (typeof code === 'string' && /^[A-Z0-9_]{2,32}$/.test(code)) return code
  return error instanceof Error && error.name ? error.name : 'error'
}

export async function checkHealth(
  deps: HealthDeps,
): Promise<{ httpStatus: 200 | 503; body: HealthBody }> {
  const now = deps.now ?? Date.now
  const startedAt = now()
  const base = { version: appVersion(deps.env), time: new Date(startedAt).toISOString() }
  try {
    // `ping` sinxron otsa ham (`Promise.resolve().then`) — 503, 500 emas.
    await withTimeout(
      Promise.resolve().then(() => deps.ping()),
      deps.timeoutMs ?? HEALTH_TIMEOUT_MS,
    )
    return {
      httpStatus: 200,
      body: { status: 'ok', db: 'ok', dbLatencyMs: now() - startedAt, ...base },
    }
  } catch (error) {
    return {
      httpStatus: 503,
      body: { status: 'error', db: 'error', dbLatencyMs: null, error: errorLabel(error), ...base },
    }
  }
}

export const HEALTH_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex',
} as const

/** Sun'iy xato so'rovi: `GET /api/health?sentry-test=1` + `Authorization: Bearer <JOBS_SECRET>`. */
export const SENTRY_TEST_PARAM = 'sentry-test'

export interface HealthRequestDeps extends HealthDeps {
  /** `Authorization` sarlavhasini tekshirish (`JOBS_SECRET`); sir sozlanmagan bo'lsa — `null`. */
  authorize: ((header: string | null) => boolean) | null
  /** Sentry yoqilganmi (`SENTRY_DSN`). */
  sentryEnabled: boolean
  /** Sun'iy xatoni Sentry'ga yuborib, event ID qaytaradi. */
  triggerSentryTest: () => Promise<string | undefined>
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...HEALTH_HEADERS, ...extra } })
}

/**
 * `GET /api/health`: 200 / 503 (`checkHealth`). `?sentry-test=1` — qabul sinovi (TZ §9.4):
 * faqat `JOBS_SECRET` Bearer bilan; sun'iy xato Sentry'ga yuboriladi va event ID qaytadi.
 */
export async function handleHealthRequest(
  request: Request,
  deps: HealthRequestDeps,
): Promise<Response> {
  const url = new URL(request.url)
  if (url.searchParams.has(SENTRY_TEST_PARAM)) {
    if (!deps.authorize) return json({ ok: false, error: 'JOBS_SECRET sozlanmagan' }, 503)
    if (!deps.authorize(request.headers.get('authorization'))) {
      return json({ ok: false, error: 'Unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' })
    }
    if (!deps.sentryEnabled) return json({ ok: false, error: 'SENTRY_DSN sozlanmagan' }, 503)
    const eventId = await deps.triggerSentryTest()
    return json({ ok: true, sentry: 'sent', eventId: eventId ?? null }, 200)
  }
  const { httpStatus, body } = await checkHealth(deps)
  return json(body, httpStatus)
}
