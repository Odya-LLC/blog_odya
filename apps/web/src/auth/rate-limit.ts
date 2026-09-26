import { createHash } from 'node:crypto'

import { DEFAULT_API_KEY_RATE_LIMIT_PER_MIN, limitsFromEnv } from '@/env.schema'

/**
 * API kalit bo'yicha oddiy rate limit (TZ §6.2): standart 60 so'rov / daqiqa
 * (`API_KEY_RATE_LIMIT_PER_MIN`), qat'iy oyna (fixed window). `admin` roli kalitlariga
 * qo'llanmaydi (OBLOG-45, `api-key.ts` → `verifyApiKey`).
 *
 * **Cheklov (hujjatlangan):** hisoblagich — jarayon xotirasida (in-memory), ya'ni har bir Vercel
 * funksiya instansiyasida alohida. Bir nechta issiq instansiya bo'lsa, amaldagi limit
 * `60 × instansiyalar soni` gacha bo'lishi mumkin; sovuq start hisoblagichni nollaydi. MVP uchun
 * (bitta muharrir + agent) yetarli; qat'iy global limit kerak bo'lsa — Postgres/Redis
 * (Contabo'ga ko'chishda doimiy jarayonda bu cheklov yo'qoladi). README → "API kalitlar".
 *
 * Kalitning o'zi xotirada saqlanmaydi — faqat SHA-256 xeshi.
 */
export const API_KEY_RATE_LIMIT = DEFAULT_API_KEY_RATE_LIMIT_PER_MIN
export const API_KEY_RATE_WINDOW_MS = 60_000

/**
 * Noto'g'ri kalitlar (brute-force himoyasi): bitta mijoz IP'sidan daqiqasiga shuncha muvaffaqiyatsiz
 * urinish. Oshsa — shu IP'dan keladigan barcha kalitli so'rovlar (to'g'ri kalit ham) oyna
 * tugaguncha DB'ga tushmasdan 429 oladi (`api-key.ts` → `verifyApiKey`).
 */
export const API_KEY_FAILURES_PER_MIN = 20

/** Xotira o'sib ketmasligi uchun: shundan ko'p yozuv bo'lsa, muddati o'tganlari tozalanadi. */
const PRUNE_THRESHOLD = 10_000

export interface RateLimitResult {
  allowed: boolean
  /** Oynadagi ruxsat etilgan son (`X-RateLimit-Limit`). */
  limit: number
  remaining: number
  /** Keyingi oyna boshlanishigacha (soniya, `Retry-After`). */
  retryAfterSec: number
}

export interface RateLimiter {
  readonly limit: number
  /** So'rovni hisoblaydi va natijani qaytaradi. */
  hit(key: string): RateLimitResult
  /** Hisoblamasdan: joriy oynada limit allaqachon tugaganmi. */
  peek(key: string): RateLimitResult
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

  const idOf = (key: string) => createHash('sha256').update(key).digest('hex')
  const resultOf = (entry: { startedAt: number; count: number }, at: number, allowed: boolean) => ({
    allowed,
    limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSec: Math.max(1, Math.ceil((entry.startedAt + windowMs - at) / 1000)),
  })

  return {
    limit,
    hit(key) {
      const at = now()
      const id = idOf(key)
      let entry = windows.get(id)
      if (!entry || at - entry.startedAt >= windowMs) {
        if (windows.size >= PRUNE_THRESHOLD) prune(at)
        entry = { startedAt: at, count: 0 }
        windows.set(id, entry)
      }
      entry.count++
      return resultOf(entry, at, entry.count <= limit)
    },
    peek(key) {
      const at = now()
      const entry = windows.get(idOf(key))
      if (!entry || at - entry.startedAt >= windowMs) {
        return { allowed: true, limit, remaining: limit, retryAfterSec: 0 }
      }
      return resultOf(entry, at, entry.count < limit)
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
const globalStore = globalThis as typeof globalThis & {
  __blogOdyaApiKeyLimiter?: RateLimiter
  __blogOdyaApiKeyFailureLimiter?: RateLimiter
}

/** Limit — `API_KEY_RATE_LIMIT_PER_MIN` (standart 60), jarayon ishga tushganda o'qiladi. */
export const apiKeyRateLimiter: RateLimiter = (globalStore.__blogOdyaApiKeyLimiter ??=
  createRateLimiter({ limit: limitsFromEnv().apiKeyPerMin }))

/** Noto'g'ri kalit urinishlari — mijoz IP'si bo'yicha (`API_KEY_FAILURES_PER_MIN`). */
export const apiKeyFailureLimiter: RateLimiter = (globalStore.__blogOdyaApiKeyFailureLimiter ??=
  createRateLimiter({ limit: API_KEY_FAILURES_PER_MIN }))
