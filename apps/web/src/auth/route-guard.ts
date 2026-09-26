import type { Payload } from 'payload'

import {
  API_KEY_SCHEME,
  apiKeyErrorResponse,
  clientIpFrom,
  extractApiKey,
  verifyApiKey,
} from './api-key'
import type { RateLimiter } from './rate-limit'

type RouteHandler<Args extends unknown[]> = (request: Request, ...args: Args) => Promise<Response>

export interface ApiKeyGuardDeps {
  getPayload: () => Promise<Payload>
  limiter?: RateLimiter
  failureLimiter?: RateLimiter
}

/**
 * Payload REST/GraphQL route handler'lari uchun o'rama (`app/(payload)/api/...`).
 *
 * `Authorization: users API-Key <kalit>` bo'lsa (`verifyApiKey`):
 * - kalit bo'yicha rate limit (`API_KEY_RATE_LIMIT_PER_MIN`, standart 60/daqiqa; `admin` roliga
 *   qo'llanmaydi) — oshsa **429** + `Retry-After`;
 * - kalit noto'g'ri yoki bekor qilingan bo'lsa — **401** (Payload o'zi bunday so'rovni jimgina
 *   anonim deb davom ettirardi; aniq xato mashina mijozlari uchun tushunarliroq); bitta IP'dan
 *   noto'g'ri urinishlar ko'p bo'lsa — **429**.
 *
 * Boshqa so'rovlar (cookie/JWT, anonim) o'zgarishsiz Payload'ga o'tadi — limit faqat API kalitga.
 */
export function createApiKeyGuard(deps: ApiKeyGuardDeps) {
  return function withApiKeyGuard<Args extends unknown[]>(
    handler: RouteHandler<Args>,
  ): RouteHandler<Args> {
    return async (request, ...args) => {
      const extracted = extractApiKey(request.headers.get('authorization'))
      if (!extracted) return handler(request, ...args)
      const payload = await deps.getPayload()
      const result = await verifyApiKey(payload, extracted.key, {
        ...(deps.limiter ? { limiter: deps.limiter } : {}),
        ...(deps.failureLimiter ? { failureLimiter: deps.failureLimiter } : {}),
        clientIp: clientIpFrom(request.headers),
      })
      if (!result.ok) return apiKeyErrorResponse(result, { scheme: API_KEY_SCHEME })
      return handler(request, ...args)
    }
  }
}
