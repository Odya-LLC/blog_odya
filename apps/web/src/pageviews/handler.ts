import { markSeen, parseSeen, serializeSeen, wasSeen } from './dedupe'
import { skipReason, type SkipReason } from './filter'

/**
 * `POST /api/views` (OBLOG-69) mantiqi — DB'siz, testlanadi (`deps.record` — `store.recordView`).
 *
 * Tana: post ID — oddiy matn (`navigator.sendBeacon('/api/views', '123')`) yoki JSON
 * `{"id":123}` / `{"postId":123}`. Javob doim `204` + `Cache-Control: no-store`: post bormi,
 * hisoblandimi — tashqariga bildirilmaydi (chop etilmagan post ID'larini aniqlab bo'lmaydi).
 */

export const MAX_BODY_LENGTH = 64

export type ViewOutcome = 'counted' | 'duplicate' | 'unknown' | 'invalid' | 'error' | SkipReason

export interface ViewRequestDeps {
  /** Hisoblaydi; post yo'q / ommaga ko'rinmaydi — `false`. */
  record: (postId: number) => Promise<boolean>
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

  const nowSec = Math.floor((deps.now?.() ?? Date.now()) / 1000)
  const seen = parseSeen(request.headers.get('cookie'), nowSec)
  if (wasSeen(seen, postId)) return done('duplicate')

  let counted: boolean
  try {
    counted = await deps.record(postId)
  } catch (error) {
    deps.onError?.(error)
    return done('error')
  }
  if (!counted) return done('unknown')
  headers.append(
    'Set-Cookie',
    serializeSeen(markSeen(seen, postId, nowSec), nowSec, isSecure(request)),
  )
  return done('counted')
}
