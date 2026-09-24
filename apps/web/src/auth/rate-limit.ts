import { createHash } from 'node:crypto'

/**
 * API kalit bo'yicha oddiy rate limit (TZ §6.2): 60 so'rov / daqiqa, qat'iy oyna (fixed window).
 *
 * **Cheklov (hujjatlangan):** hisoblagich — jarayon xotirasida (in-memory), ya'ni har bir Vercel
 * funksiya instansiyasida alohida. Bir nechta issiq instansiya bo'lsa, amaldagi limit
 * `60 × instansiyalar soni` gacha bo'lishi mumkin; sovuq start hisoblagichni nollaydi. MVP uchun
 * (bitta muharrir + agent) yetarli; qat'iy global limit kerak bo'lsa — Postgres/Redis
 * (Contabo'ga ko'chishda doimiy jarayonda bu cheklov yo'qoladi). README → "API kalitlar".
 *
 * Kalitning o'zi xotirada saqlanmaydi — faqat SHA-256 xeshi.
 */
export const API_KEY_RATE_LIMIT = 60
export const API_KEY_RATE_WINDOW_MS = 60_000

/** Xotira o'sib ketmasligi uchun: shundan ko'p yozuv bo'lsa, muddati o'tganlari tozalanadi. */
const PRUNE_THRESHOLD = 10_000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Keyingi oyna boshlanishigacha (soniya, `Retry-After`). */
  retryAfterSec: number
}

export interface RateLimiter {
  hit(key: string): RateLimitResult
  reset(): void
}

export interface RateLimiterOptions {
  limit?: number
  windowMs?: number
  now?: () => number
}

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const limit = options.limit ?? API_KEY_RATE_LIMIT
  const windowMs = options.windowMs ?? API_KEY_RATE_WINDOW_MS
  const now = options.now ?? Date.now
  const windows = new Map<string, { startedAt: number; count: number }>()

  const prune = (at: number) => {
    for (const [id, entry] of windows) {
      if (at - entry.startedAt >= windowMs) windows.delete(id)
    }
  }

  return {
    hit(key) {
      const at = now()
      const id = createHash('sha256').update(key).digest('hex')
      let entry = windows.get(id)
      if (!entry || at - entry.startedAt >= windowMs) {
        if (windows.size >= PRUNE_THRESHOLD) prune(at)
        entry = { startedAt: at, count: 0 }
        windows.set(id, entry)
      }
      entry.count++
      const retryAfterSec = Math.max(1, Math.ceil((entry.startedAt + windowMs - at) / 1000))
      return {
        allowed: entry.count <= limit,
        remaining: Math.max(0, limit - entry.count),
        retryAfterSec,
      }
    },
    reset() {
      windows.clear()
    },
  }
}

/**
 * Jarayon bo'yicha umumiy limiter (REST/GraphQL guard va MCP). `globalThis` da — Next.js
 * route bundle'lari modulni alohida yuklasa ham hisoblagich bitta bo'lsin.
 */
const globalStore = globalThis as typeof globalThis & { __blogOdyaApiKeyLimiter?: RateLimiter }

export const apiKeyRateLimiter: RateLimiter = (globalStore.__blogOdyaApiKeyLimiter ??=
  createRateLimiter())
