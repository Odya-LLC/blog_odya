import config from '@payload-config'
import { getPayload } from 'payload'

import { env } from '@/env'
import { isAuthorized } from '@/jobs/runner'
import { handleHealthRequest, type HealthRequestDeps } from '@/lib/health'
import { captureError, flushSentry, isSentryEnabled } from '@/lib/sentry'

/**
 * `GET /api/health` — UptimeRobot (har 5 daqiqa, TZ §9.4, §3.7.2): DB'ga `select 1` + versiya.
 * 200 — hammasi joyida, 503 — DB javob bermayapti (Supabase pauza/uzilish). Mantiq —
 * `src/lib/health.ts`; qo'llanma — `docs/runbooks/monitoring.md`.
 *
 * `?sentry-test=1` + `Authorization: Bearer <JOBS_SECRET>` — Sentry'ga sun'iy xato yuborish.
 */
export const dynamic = 'force-dynamic'

function deps(): HealthRequestDeps {
  const secret = env.JOBS_SECRET
  return {
    ping: async () => {
      const payload = await getPayload({ config })
      await payload.db.pool.query('select 1')
    },
    authorize: secret ? (header) => isAuthorized(header, secret) : null,
    sentryEnabled: isSentryEnabled(),
    triggerSentryTest: async () => {
      const eventId = captureError(
        new Error('Sentry sinov xatosi (OBLOG-23): GET /api/health?sentry-test=1'),
        { tags: { source: 'health-sentry-test' } },
      )
      await flushSentry()
      return eventId
    },
  }
}

export async function GET(request: Request): Promise<Response> {
  return handleHealthRequest(request, deps())
}

/** UptimeRobot HTTP monitori standart holatda `HEAD` yuboradi — status o'sha, tanasiz. */
export async function HEAD(request: Request): Promise<Response> {
  const response = await handleHealthRequest(request, deps())
  return new Response(null, { status: response.status, headers: response.headers })
}
