/* Payload generatsiya qilgan fayl; API kalit guard'i (M2-05) qo'shilgan — qayta generatsiyada saqlang. */
import config from '@payload-config'
import { GRAPHQL_POST, REST_OPTIONS } from '@payloadcms/next/routes'
import { getPayload } from 'payload'

import { createApiKeyGuard } from '@/auth/route-guard'

const guard = createApiKeyGuard({ getPayload: () => getPayload({ config }) })

export const POST = guard(GRAPHQL_POST(config))

export const OPTIONS = REST_OPTIONS(config)
