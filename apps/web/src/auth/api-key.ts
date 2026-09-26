import { createHmac } from 'node:crypto'

import type { Payload } from 'payload'

import { isAdminUser, roleOf } from '@/access'
import type { User } from '@/payload-types'

import {
  apiKeyFailureLimiter,
  apiKeyRateLimiter,
  type RateLimiter,
  type RateLimitResult,
} from './rate-limit'

/**
 * Shaxsiy API kalitlar (TZ §6.2, §6.3, §9.2): Payload `auth.useAPIKey` (`users` kolleksiyasi).
 *
 * - REST/GraphQL: `Authorization: users API-Key <kalit>` — Payload'ning o'z strategiyasi.
 * - MCP (M2-06): `Authorization: Bearer <kalit>` — `authenticateBearer()` shu yerda.
 *
 * DB'da kalitning o'zi shifrlangan (`apiKey`), qidiruv — HMAC-SHA256 indeksi (`apiKeyIndex`,
 * `PAYLOAD_SECRET` bilan). Bekor qilingan kalitda (admin'dagi "Revoke" yoki `enableAPIKey: false`)
 * indeks tozalanadi (`revokeDisabledAPIKey`), shuning uchun eski kalit hech bir yo'l bilan
 * ishlamaydi. Yangi kalit generatsiyasi eskisini almashtiradi.
 */
export const API_KEY_SCHEME = 'users API-Key'

export type ApiKeyUser = User & { collection: 'users'; _strategy: 'api-key' }

export type CredentialScheme = 'api-key' | 'bearer'

export interface ExtractedKey {
  scheme: CredentialScheme
  key: string
}

/**
 * `Authorization` sarlavhasidan kalitni ajratish. `bearer: true` — MCP uchun `Bearer <kalit>`
 * ham qabul qilinadi (REST'da `Bearer` — Payload JWT, shuning uchun u yerda o'chiq).
 */
export function extractApiKey(
  header: string | null | undefined,
  { bearer = false }: { bearer?: boolean } = {},
): ExtractedKey | null {
  if (!header) return null
  if (header.startsWith(`${API_KEY_SCHEME} `)) {
    const key = header.slice(API_KEY_SCHEME.length + 1).trim()
    return key ? { scheme: 'api-key', key } : null
  }
  if (bearer) {
    const match = header.match(/^Bearer\s+(.+)$/i)
    const key = match?.[1]?.trim()
    if (key) return { scheme: 'bearer', key }
  }
  return null
}

/** Payload'ning `apiKeyIndex` hisobi bilan bir xil (v3.46+: HMAC-SHA256, hex). */
export function apiKeyIndex(key: string, secret: string): string {
  return createHmac('sha256', secret).update(key).digest('hex')
}

/**
 * Kalit egasini topish. Kalit bekor qilingan yoki egasining roli noma'lum bo'lsa — `null`.
 * Qaytgan obyekt Local API `user` argumenti sifatida ishlatiladi (`overrideAccess: false`).
 */
export async function findUserByApiKey(payload: Payload, key: string): Promise<ApiKeyUser | null> {
  if (!key) return null
  const { docs } = await payload.find({
    collection: 'users',
    // Payload strategiyasi kabi — faqat indeks bo'yicha (bekor qilinganda indeks tozalanadi).
    where: { apiKeyIndex: { equals: apiKeyIndex(key, payload.secret) } },
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const user = docs[0]
  if (!user || !roleOf({ ...user, collection: 'users' })) return null
  return { ...user, collection: 'users', _strategy: 'api-key' }
}

export type BearerAuthResult =
  | { ok: true; user: ApiKeyUser }
  | { ok: false; status: 401; error: string }
  | { ok: false; status: 429; error: string; retryAfterSec: number; limit: number }

export interface VerifyApiKeyOptions {
  /** Kalit bo'yicha limit (`API_KEY_RATE_LIMIT_PER_MIN`, standart 60/daqiqa; admin'ga yo'q). */
  limiter?: RateLimiter
  /** Noto'g'ri kalit urinishlari — mijoz IP'si bo'yicha (brute-force himoyasi). */
  failureLimiter?: RateLimiter
  /** Mijoz IP'si (`clientIpFrom(headers)`); bo'lmasa IP bo'yicha himoya qo'llanmaydi. */
  clientIp?: string | null
}

function tooManyRequests(limit: RateLimitResult): BearerAuthResult {
  return {
    ok: false,
    status: 429,
    error: "So'rovlar juda ko'p — birozdan keyin qayta urinib ko'ring",
    retryAfterSec: limit.retryAfterSec,
    limit: limit.limit,
  }
}

/**
 * Mijoz IP'si: `x-forwarded-for` ning birinchi qiymati yoki `x-real-ip`. Vercel bu sarlavhani
 * o'zi yozadi (mijoz soxtalashtira olmaydi); boshqa hostingda — reverse proxy sozlamasiga bog'liq.
 */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || null
}

/**
 * Kalitni tekshirish (OBLOG-45). REST/GraphQL guard'i (`route-guard.ts`) va MCP
 * (`authenticateBearer`) uchun umumiy yo'l:
 *
 * 1. Shu IP'dan noto'g'ri kalitlar limiti (`API_KEY_FAILURES_PER_MIN`) tugagan bo'lsa — DB'ga
 *    tushmasdan **429**, to'g'ri kalit bilan ham (aks holda limit taxmin qilishni sekinlashtirmasdi).
 * 2. Kalit egasini topish — har bir so'rovda bitta indeksli DB so'rovi (rol shundan ma'lum).
 * 3. Kalit topilmadi — kalit va IP hisoblagichlari oshadi; limit oshgan bo'lsa **429**, aks holda
 *    **401**.
 * 4. `admin` — limitsiz. Boshqa rollar — kalit bo'yicha limit, oshsa **429**.
 */
export async function verifyApiKey(
  payload: Payload,
  key: string,
  {
    limiter = apiKeyRateLimiter,
    failureLimiter = apiKeyFailureLimiter,
    clientIp = null,
  }: VerifyApiKeyOptions = {},
): Promise<BearerAuthResult> {
  const failureBucket = clientIp ? `ip:${clientIp}` : null
  if (failureBucket) {
    const failures = failureLimiter.peek(failureBucket)
    if (!failures.allowed) return tooManyRequests(failures)
  }

  const user = await findUserByApiKey(payload, key)
  if (!user) {
    const byKey = limiter.hit(key)
    const byIp = failureBucket ? failureLimiter.hit(failureBucket) : null
    if (!byKey.allowed) return tooManyRequests(byKey)
    if (byIp && !byIp.allowed) return tooManyRequests(byIp)
    return { ok: false, status: 401, error: "API kalit noto'g'ri yoki bekor qilingan" }
  }

  if (!isAdminUser(user)) {
    const limit = limiter.hit(key)
    if (!limit.allowed) return tooManyRequests(limit)
  }
  return { ok: true, user }
}

/**
 * MCP (M2-06) uchun: `Authorization: Bearer <kalit>` (yoki `users API-Key <kalit>`) →
 * foydalanuvchi (rate limit bilan).
 *
 * ```ts
 * const auth = await authenticateBearer(payload, request.headers)
 * if (!auth.ok) return apiKeyErrorResponse(auth)
 * await payload.find({ collection: 'posts', user: auth.user, overrideAccess: false,
 *   context: { channel: 'mcp', mcpTool: 'search_posts' } })
 * ```
 */
export async function authenticateBearer(
  payload: Payload,
  headers: Headers,
  options: Omit<VerifyApiKeyOptions, 'clientIp'> = {},
): Promise<BearerAuthResult> {
  const extracted = extractApiKey(headers.get('authorization'), { bearer: true })
  if (!extracted) return { ok: false, status: 401, error: 'API kalit berilmagan' }
  return verifyApiKey(payload, extracted.key, { ...options, clientIp: clientIpFrom(headers) })
}

/**
 * `BearerAuthResult` xatosi → HTTP javob (Payload xato formati: `{ errors: [{ message }] }`).
 * 429 — `Retry-After` sarlavhasi va `errors[0].retryAfterSec` maydoni.
 */
export function apiKeyErrorResponse(
  result: Exclude<BearerAuthResult, { ok: true }>,
  { scheme = 'Bearer' }: { scheme?: string } = {},
): Response {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  if (result.status === 401) headers['WWW-Authenticate'] = scheme
  if (result.status === 429) {
    headers['Retry-After'] = String(result.retryAfterSec)
    headers['X-RateLimit-Limit'] = String(result.limit)
  }
  const error =
    result.status === 429
      ? { message: result.error, retryAfterSec: result.retryAfterSec }
      : { message: result.error }
  return Response.json({ errors: [error] }, { status: result.status, headers })
}
