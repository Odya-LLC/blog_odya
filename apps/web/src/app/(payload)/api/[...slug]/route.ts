/* Payload generatsiya qilgan fayl; API kalit guard'i (M2-05) qo'shilgan — qayta generatsiyada saqlang. */
import config from '@payload-config'
import '@payloadcms/next/css'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'
import { getPayload } from 'payload'

import { createApiKeyGuard } from '@/auth/route-guard'

// `users API-Key` so'rovlari: rate limit (429) va bekor qilingan kalit — 401 (src/auth).
const guard = createApiKeyGuard({ getPayload: () => getPayload({ config }) })

export const GET = guard(REST_GET(config))
export const POST = guard(REST_POST(config))
export const DELETE = guard(REST_DELETE(config))
export const PATCH = guard(REST_PATCH(config))
export const PUT = guard(REST_PUT(config))
export const OPTIONS = REST_OPTIONS(config)
