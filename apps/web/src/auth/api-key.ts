import { createHmac } from 'node:crypto'

import type { Payload } from 'payload'

import { roleOf } from '@/access'
import type { User } from '@/payload-types'

import { API_KEY_RATE_LIMIT, apiKeyRateLimiter, type RateLimiter } from './rate-limit'

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
  | { ok: false; status: 429; error: string; retryAfterSec: number }

/**
 * Kalitni tekshirish: avval rate limit (kalit bo'yicha, 60/daqiqa), keyin egasini topish.
 * REST/GraphQL guard'i (`route-guard.ts`) va MCP (`authenticateBearer`) uchun umumiy yo'l.
 */
export async function verifyApiKey(
  payload: Payload,
  key: string,
  { limiter = apiKeyRateLimiter }: { limiter?: RateLimiter } = {},
): Promise<BearerAuthResult> {
  const limit = limiter.hit(key)
  if (!limit.allowed) {
    return {
      ok: false,
      status: 429,
      error: "So'rovlar juda ko'p — birozdan keyin qayta urinib ko'ring",
      retryAfterSec: limit.retryAfterSec,
    }
  }
  const user = await findUserByApiKey(payload, key)
  if (!user) return { ok: false, status: 401, error: "API kalit noto'g'ri yoki bekor qilingan" }
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
  options: { limiter?: RateLimiter } = {},
): Promise<BearerAuthResult> {
  const extracted = extractApiKey(headers.get('authorization'), { bearer: true })
  if (!extracted) return { ok: false, status: 401, error: 'API kalit berilmagan' }
  return verifyApiKey(payload, extracted.key, options)
}

/** `BearerAuthResult` xatosi → HTTP javob (Payload xato formati: `{ errors: [{ message }] }`). */
export function apiKeyErrorResponse(
  result: Exclude<BearerAuthResult, { ok: true }>,
  { scheme = 'Bearer' }: { scheme?: string } = {},
): Response {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  if (result.status === 401) headers['WWW-Authenticate'] = scheme
  if (result.status === 429) {
    headers['Retry-After'] = String(result.retryAfterSec)
    headers['X-RateLimit-Limit'] = String(API_KEY_RATE_LIMIT)
  }
  return Response.json({ errors: [{ message: result.error }] }, { status: result.status, headers })
}
