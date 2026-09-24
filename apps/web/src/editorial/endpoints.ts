import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { rejectScrapedItem, takeScrapedItem } from './actions'

/**
 * `scraped-items` custom endpoint'lari (admin "Yangiliklar navbati" chaqiradi):
 *
 * - `POST /api/scraped-items/:id/take`   body: `{ categoryId?: number }`
 *   → `200 { post, item, created, editUrl }`
 * - `POST /api/scraped-items/:id/reject` body: `{ reason: string }`
 *   → `200 { item, changed }`
 *
 * Autentifikatsiya — Payload (cookie JWT yoki `users API-Key`). Xatolar:
 * `{ errors: [{ message }] }` — 400 / 401 / 403 / 404 / 409.
 */

function parseId(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

async function readBody(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json?.()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function errorResponse(error: unknown, req: PayloadRequest): Response {
  if (error instanceof APIError) {
    return Response.json({ errors: [{ message: error.message }] }, { status: error.status })
  }
  req.payload.logger.error({ err: error, msg: 'Tahririyat navbati: kutilmagan xato' })
  return Response.json({ errors: [{ message: 'Ichki xatolik.' }] }, { status: 500 })
}

function withItemId(
  run: (req: PayloadRequest, id: number, body: Record<string, unknown>) => Promise<unknown>,
): Endpoint['handler'] {
  return async (req) => {
    try {
      // Avval autentifikatsiya: anonim so'rovga element mavjudligini ham oshkor qilmaymiz.
      if (!req.user)
        return Response.json({ errors: [{ message: 'Tizimga kiring.' }] }, { status: 401 })
      const id = parseId(req.routeParams?.id)
      if (id === null) {
        return Response.json({ errors: [{ message: 'Noto‘g‘ri element ID.' }] }, { status: 400 })
      }
      return Response.json(await run(req, id, await readBody(req)))
    } catch (error) {
      return errorResponse(error, req)
    }
  }
}

export function postEditUrl(adminRoute: string, id: number | string): string {
  return `${adminRoute.replace(/\/$/, '')}/collections/posts/${id}`
}

export const scrapedItemEndpoints: Endpoint[] = [
  {
    path: '/:id/take',
    method: 'post',
    handler: withItemId(async (req, id, body) => {
      const raw = body.categoryId
      const empty = raw === undefined || raw === null || raw === ''
      const categoryId = empty ? null : parseId(raw)
      if (!empty && categoryId === null) {
        throw new APIError('Noto‘g‘ri kategoriya ID.', 400, null, true)
      }
      const result = await takeScrapedItem(req, { id, categoryId })
      return {
        ...result,
        editUrl: postEditUrl(req.payload.config.routes.admin, result.post.id),
      }
    }),
  },
  {
    path: '/:id/reject',
    method: 'post',
    handler: withItemId((req, id, body) => rejectScrapedItem(req, { id, reason: body.reason })),
  },
]
