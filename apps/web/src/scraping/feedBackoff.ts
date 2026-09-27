import { FeedHttpError, type FeedErrorKind } from './feed'

/**
 * Doimiy xato beradigan feed'lar uchun backoff (OBLOG-53). Holat `sources.feeds[]` qatorida:
 * `failureCount` (ketma-ket xatolar), `lastErrorKind`, `nextPollAt` (shu vaqtgacha feed
 * "muddati kelgan" hisoblanmaydi — `isFeedDue`).
 *
 * - `cloudflare` (challenge): darhol `BLOCKED_RECHECK_MS` (24 soat) — challenge chetlab
 *   o'tilmaydi (docs/sources.md §3.5b), tez-tez so'rash foydasiz va manbaga nisbatan odobsiz;
 * - boshqa xatolar: birinchi `GRACE_FAILURES` ta — oddiy `pollIntervalMin` (vaqtinchalik
 *   nosozlik), keyin oraliq har safar ikki baravar: 15 daq → 30 → 60 → 2 soat → … → 24 soat (cap);
 * - muvaffaqiyatli o'qish (200/304) — holat to'liq tozalanadi.
 *
 * Admin feed URL'ini o'zgartirsa yoki manbani qayta yoqsa — holat tozalanadi (`Sources` hook'i),
 * feed keyingi scheduler tsiklida darhol tekshiriladi.
 */

export const FEED_BACKOFF = {
  /** Shuncha ketma-ket xatogacha backoff yo'q (oddiy interval). */
  graceFailures: 2,
  /** Eksponensial backoff chegarasi. */
  maxDelayMs: 24 * 60 * 60_000,
  /** Cloudflare challenge — kuniga 1 marta qayta tekshirish. */
  blockedRecheckMs: 24 * 60 * 60_000,
} as const

export interface FeedBackoffState {
  failureCount?: number | null
  lastErrorKind?: FeedErrorKind | null
  nextPollAt?: string | null
}

export function classifyFeedError(error: unknown): FeedErrorKind {
  if (error instanceof FeedHttpError) return error.kind
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
    return 'timeout'
  return 'network'
}

/**
 * `failureCount`-chi ketma-ket xatodan keyin keyingi tekshiruvgacha qo'shimcha kutish (ms).
 * `0` — backoff yo'q, feed oddiy `pollIntervalMin` bo'yicha o'qiladi.
 */
export function feedBackoffDelayMs(
  kind: FeedErrorKind,
  failureCount: number,
  intervalMin: number,
): number {
  if (kind === 'cloudflare') return FEED_BACKOFF.blockedRecheckMs
  const over = failureCount - FEED_BACKOFF.graceFailures
  if (over <= 0) return 0
  const base = Math.max(1, intervalMin) * 60_000
  // 2^over tez o'sadi — kattalarida to'g'ridan-to'g'ri cap (Infinity/overflow'dan saqlanish).
  if (over >= 20) return FEED_BACKOFF.maxDelayMs
  return Math.min(base * 2 ** over, FEED_BACKOFF.maxDelayMs)
}

/** Xatodan keyingi holat (`requestAt` — so'rov vaqti). */
export function nextFeedFailureState(
  previous: FeedBackoffState,
  kind: FeedErrorKind,
  options: { requestAt: number; intervalMin: number },
): Required<FeedBackoffState> {
  const failureCount = Math.max(0, Number(previous.failureCount ?? 0) || 0) + 1
  const delay = feedBackoffDelayMs(kind, failureCount, options.intervalMin)
  return {
    failureCount,
    lastErrorKind: kind,
    nextPollAt: delay > 0 ? new Date(options.requestAt + delay).toISOString() : null,
  }
}

/** Muvaffaqiyatli o'qishdan (yoki admin tozalashidan) keyingi holat. */
export const CLEAR_FEED_BACKOFF: Required<FeedBackoffState> = {
  failureCount: 0,
  lastErrorKind: null,
  nextPollAt: null,
}
