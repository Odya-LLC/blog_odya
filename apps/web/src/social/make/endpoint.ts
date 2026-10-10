import { LOCALES, type Locale } from '@blog-odya/shared/locales'
import type { Endpoint, PayloadRequest } from 'payload'

import { isAdminUser } from '@/access'
import { queueMakeDeliveries, runMakeJobsSoon } from '@/collections/Posts/make'

import { sendDigestTest } from '../instagram/digest'
import { loadMakeConfig } from './config'
import { sendMakeTest } from './deliver'

/**
 * `POST /api/posts/:id/make` (faqat admin, OBLOG-91) — post yon panelidagi Make tugmalari:
 *
 * - `{ "mode": "test", "script": "uz-Latn" }` → shu post JSON'i `test: true` bilan darhol
 *   yuboriladi (holat yozilmaydi) → `200 { ok, httpStatus, message, payload }`. Make'da maydonlarni
 *   xaritalash uchun ("Redetermine data structure"). `"type": "story" | "digest"` (OBLOG-118) —
 *   story JSON'i yoki dayjest karuseli (shu post + oxirgi chop etilganlar, lotin).
 * - `{ "mode": "send" }` → chop etilgan post hali yuborilmagan yozuvlari uchun `make.webhook`
 *   job'lari (masalan, Make yoqilishidan oldin chop etilgan post yoki xatodan keyin) →
 *   `200 { queued }`. `socialSkip` hisobga olinadi.
 */

async function readBody(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json?.()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const error = (message: string, status: number) =>
  Response.json({ errors: [{ message }] }, { status })

export const makeEndpoint: Endpoint = {
  path: '/:id/make',
  method: 'post',
  handler: async (req) => {
    if (!req.user) return error('Tizimga kiring.', 401)
    if (!isAdminUser(req.user)) return error('Faqat administrator.', 403)
    const rawId = req.routeParams?.id
    const id = typeof rawId === 'string' && /^\d+$/.test(rawId) ? Number(rawId) : null
    if (!id) return error('Noto‘g‘ri ID.', 400)
    const body = await readBody(req)
    const script = (body.script ?? 'uz-Latn') as Locale
    if (!(LOCALES as readonly string[]).includes(script)) return error('Noto‘g‘ri yozuv.', 400)

    if (body.mode === 'test') {
      // OBLOG-118: `type` — `post` (standart), `story` yoki `digest` (karusel, lotin).
      const type = body.type ?? 'post'
      if (type === 'digest') {
        return Response.json(await sendDigestTest(req.payload, { postId: id }))
      }
      if (type !== 'post' && type !== 'story') return error('type: post | story | digest.', 400)
      return Response.json(
        await sendMakeTest(req.payload, {
          postId: id,
          script,
          event: type === 'story' ? 'post.story' : 'post.published',
        }),
      )
    }
    if (body.mode === 'send') {
      const config = await loadMakeConfig(req.payload)
      if (!config.enabled) return error('Make o‘chiq (Ijtimoiy tarmoqlar (Make) → yoqing).', 409)
      if (!config.webhookUrl) return error('Webhook URL sozlanmagan.', 409)
      const post = await req.payload.findByID({
        collection: 'posts',
        id,
        depth: 0,
        draft: false,
        overrideAccess: true,
        disableErrors: true,
        select: { _status: true, workflowStatus: true, socialSkip: true },
      })
      if (!post || post._status !== 'published' || post.workflowStatus !== 'published') {
        return error('Post chop etilmagan.', 409)
      }
      if (post.socialSkip) return error('“Ijtimoiy tarmoqlarga yubormaslik” belgilangan.', 409)
      const ids = await queueMakeDeliveries(req.payload, id, config)
      runMakeJobsSoon(req.payload, ids)
      return Response.json({ queued: ids.length })
    }
    return error('mode: "test" yoki "send".', 400)
  },
}
