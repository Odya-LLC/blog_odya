import config from '@payload-config'
import { getPayload } from 'payload'

import { env } from '@/env'
import { captureError } from '@/lib/sentry'
import { handleViewRequest } from '@/pageviews/handler'
import { VIEW_LIMITS_PRUNE_BATCH } from '@/pageviews/ratelimit'
import { deleteExpiredViewLimits, recordView } from '@/pageviews/store'

/**
 * `POST /api/views` — maqola ko'rishlari hisoblagichi (OBLOG-69). Brauzer maqolada ~5 s
 * ko'ringandan keyin `navigator.sendBeacon` bilan post ID'sini yuboradi (`pageviews/beacon.ts`).
 * Botlar, prefetch, begona saytlar va 30 daqiqa ichidagi takrorlar hisoblanmaydi; cookie'siz
 * skriptlarga qarshi — IP bo'yicha takror va limitlar (OBLOG-71, `pageviews/ratelimit.ts`;
 * IP saqlanmaydi, faqat `PAYLOAD_SECRET` bilan kunlik HMAC). Javob doim `204`. Mantiq —
 * `src/pageviews/handler.ts`. `/api/…` proxy matcher'iga kirmaydi (410 yo'q), `robots.txt` da yopiq.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const { response } = await handleViewRequest(request, {
    record: async (postId, guard) => recordView(await getPayload({ config }), postId, { guard }),
    rateLimit: {
      secret: env.PAYLOAD_SECRET,
      limits: {
        perHour: env.PAGEVIEW_RATE_PER_HOUR,
        perDay: env.PAGEVIEW_RATE_PER_DAY,
        perPostHour: env.PAGEVIEW_RATE_PER_POST_HOUR,
      },
    },
    prune: async () =>
      deleteExpiredViewLimits(await getPayload({ config }), { limit: VIEW_LIMITS_PRUNE_BATCH }),
    onError: (error) => captureError(error, { tags: { source: 'pageviews' } }),
  })
  return response
}
