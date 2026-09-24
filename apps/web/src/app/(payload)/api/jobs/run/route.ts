import config from '@payload-config'
import { getPayload } from 'payload'

import { env } from '@/env'
import { handleJobsRunRequest } from '@/jobs/runner'

/**
 * `POST /api/jobs/run` — Payload Jobs'ni tashqi scheduler ishga tushiradi (TZ §3.5):
 * Supabase pg_cron + pg_net (`infra/supabase/cron.sql`), zaxira — GitHub Actions.
 * Auth: `Authorization: Bearer <JOBS_SECRET>`. Mantiq — `src/jobs/runner.ts`.
 *
 * Ichki deadline ≈ 40 s + task grace 10 s < `maxDuration` (60 s).
 */
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return handleJobsRunRequest(request, {
    getPayload: () => getPayload({ config }),
    secret: env.JOBS_SECRET,
  })
}
