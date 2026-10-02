import config from '@payload-config'
import { getPayload } from 'payload'

import { captureError } from '@/lib/sentry'
import { handleViewRequest } from '@/pageviews/handler'
import { recordView } from '@/pageviews/store'

/**
 * `POST /api/views` — maqola ko'rishlari hisoblagichi (OBLOG-69). Brauzer maqolada ~5 s
 * ko'ringandan keyin `navigator.sendBeacon` bilan post ID'sini yuboradi (`pageviews/beacon.ts`).
 * Botlar, prefetch, begona saytlar va 30 daqiqa ichidagi takrorlar hisoblanmaydi; javob doim
 * `204`. Mantiq — `src/pageviews/handler.ts`. `/api/…` proxy matcher'iga kirmaydi (410 yo'q),
 * `robots.txt` da yopiq.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const { response } = await handleViewRequest(request, {
    record: async (postId) => recordView(await getPayload({ config }), postId),
    onError: (error) => captureError(error, { tags: { source: 'pageviews' } }),
  })
  return response
}
