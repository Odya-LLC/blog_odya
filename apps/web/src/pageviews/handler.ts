import type { PageviewLimits } from '@/env.schema'

import { markSeen, parseSeen, serializeSeen, wasSeen } from './dedupe'
import { skipReason, type SkipReason } from './filter'
import { buildViewGuard, VIEW_LIMITS_PRUNE_PROBABILITY, type ViewGuard } from './ratelimit'
import type { RecordViewResult } from './store'

/**
 * `POST /api/views` (OBLOG-69) mantiqi — DB'siz, testlanadi (`deps.record` — `store.recordView`).
 *
 * Tana: post ID — oddiy matn (`navigator.sendBeacon('/api/views', '123')`) yoki JSON
 * `{"id":123}` / `{"postId":123}`. Javob doim `204` + `Cache-Control: no-store`: post bormi,
 * hisoblandimi, limit tugadimi — tashqariga bildirilmaydi (chop etilmagan post ID'larini
 * aniqlab bo'lmaydi, skript limitga yetganini bilmaydi).
 *
 * Tartib: filtr (bot, prefetch, begona sayt) → tana → cookie dedupe (DB'siz) → `record` — IP
 * guard bilan (OBLOG-71, `ratelimit.ts`; `deps.rateLimit` berilgan va IP topilgan bo'lsa) —
 * bitta SQL so'rov. Ba'zan (`VIEW_LIMITS_PRUNE_PROBABILITY`) undan keyin muddati o'tgan limit
 * qatorlari tozalanadi (`deps.prune`).
 */

export const MAX_BODY_LENGTH = 64

export type ViewOutcome =
  'counted' | 'duplicate' | 'limited' | 'unknown' | 'invalid' | 'error' | SkipReason

export interface ViewRequestDeps {
  /**
   * Hisoblaydi (`store.recordView`). `boolean` ham qabul qilinadi: `true` — hisoblandi,
   * `false` — post yo'q / ommaga ko'rinmaydi.
   */
  record: (postId: number, guard: ViewGuard | null) => Promise<RecordViewResult | boolean>
  /** IP bo'yicha himoya (OBLOG-71): kunlik HMAC uchun sir va limitlar. Bo'lmasa — o'chiq. */
  rateLimit?: { secret: string; limits: PageviewLimits }
  /** Muddati o'tgan limit qatorlarini tozalash (ba'zi so'rovlarda). */
  prune?: () => Promise<unknown>
  random?: () => number
  now?: () => number
  onError?: (error: unknown) => void
}

export function parsePostId(body: string): number | null {
  const text = body.trim()
  if (!text || text.length > MAX_BODY_LENGTH) return null
  let value: unknown = text
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { id?: unknown; postId?: unknown }
      value = parsed.id ?? parsed.postId
    } catch {
      return null
    }
  }
  const raw = typeof value === 'number' ? String(value) : value
  if (typeof raw !== 'string' || !/^\d{1,10}$/.test(raw)) return null
  const id = Number(raw)
  return id > 0 && id <= 2_147_483_647 ? id : null
}

async function readBody(request: Request): Promise<string> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BODY_LENGTH) return ''
  const text = await request.text()
  return text.length > MAX_BODY_LENGTH ? '' : text
}

function isSecure(request: Request): boolean {
  const proto = request.headers.get('x-forwarded-proto')
  if (proto) return proto.split(',')[0]?.trim() === 'https'
  return new URL(request.url).protocol === 'https:'
}

export async function handleViewRequest(
  request: Request,
  deps: ViewRequestDeps,
): Promise<{ response: Response; outcome: ViewOutcome }> {
  const headers = new Headers({ 'Cache-Control': 'no-store' })
  const done = (outcome: ViewOutcome) => ({
    response: new Response(null, { status: 204, headers }),
    outcome,
  })

  const skip = skipReason(request)
  if (skip) return done(skip)
  const postId = parsePostId(await readBody(request).catch(() => ''))
  if (postId === null) return done('invalid')

  const nowMs = deps.now?.() ?? Date.now()
  const nowSec = Math.floor(nowMs / 1000)
  const seen = parseSeen(request.headers.get('cookie'), nowSec)
  if (wasSeen(seen, postId)) return done('duplicate')

  const guard = deps.rateLimit
    ? buildViewGuard({ headers: request.headers, postId, nowMs, ...deps.rateLimit })
    : null
  let result: RecordViewResult
  try {
    const raw = await deps.record(postId, guard)
    result = raw === true ? 'counted' : raw === false ? 'unknown' : raw
  } catch (error) {
    deps.onError?.(error)
    return done('error')
  }
  if (guard && deps.prune && (deps.random ?? Math.random)() < VIEW_LIMITS_PRUNE_PROBABILITY) {
    await deps.prune().catch((error: unknown) => deps.onError?.(error))
  }
  // Takror (IP + UA) bo'lsa ham cookie qo'yiladi — keyingi qayta yuklashlar DB'ga bormaydi.
  if (result === 'counted' || result === 'duplicate') {
    headers.append(
      'Set-Cookie',
      serializeSeen(markSeen(seen, postId, nowSec), nowSec, isSecure(request)),
    )
  }
  return done(result)
}
