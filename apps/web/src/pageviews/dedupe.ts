/**
 * Takroriy ko'rishlarni kesish (OBLOG-69) — cookie bilan, yon ta'sirsiz (testlanadi).
 *
 * Bitta tashrifchi bitta postni `VIEW_DEDUPE_SECONDS` (30 daqiqa) ichida bir marta hisoblatadi.
 * Serverless instansiyalar xotirani bo'lishmaydi, DB jadvali esa har ko'rishga qo'shimcha yozuv
 * bo'lardi — shuning uchun holat brauzerda: `bo_pv` cookie'si, faqat `/api/views` yo'liga
 * (`Path`), `HttpOnly`, `SameSite=Strict`. Ichida faqat post ID'lari va muddati
 * (`123-1727900000_456-1727900100`), hech qanday identifikator yo'q. Cookie bloklangan
 * brauzerda har sahifa yuklanishi bir martadan hisoblanadi (taxminiy hisob — kutilgan).
 */

export const VIEW_COOKIE = 'bo_pv'
export const VIEW_DEDUPE_SECONDS = 30 * 60
/** Cookie hajmi chegarasi: eng yangi shuncha post saqlanadi (~20 belgi har biri). */
export const VIEW_COOKIE_MAX_ENTRIES = 40

/** postId → muddati tugash vaqti (unix soniya). */
export type SeenMap = Map<number, number>

function cookieValue(header: string | null | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return null
}

/** `Cookie` sarlavhasidan muddati o'tmagan yozuvlar. Buzilgan qismlar e'tiborsiz. */
export function parseSeen(cookieHeader: string | null | undefined, nowSec: number): SeenMap {
  const seen: SeenMap = new Map()
  const raw = cookieValue(cookieHeader, VIEW_COOKIE)
  if (!raw) return seen
  for (const entry of raw.split('_')) {
    const match = /^(\d{1,10})-(\d{1,12})$/.exec(entry)
    if (!match) continue
    const id = Number(match[1])
    const expires = Number(match[2])
    if (expires > nowSec) seen.set(id, Math.max(expires, seen.get(id) ?? 0))
  }
  return seen
}

export function wasSeen(seen: SeenMap, postId: number): boolean {
  return seen.has(postId)
}

/** Postni belgilaydi va eng yangi `VIEW_COOKIE_MAX_ENTRIES` tasini qoldiradi. */
export function markSeen(seen: SeenMap, postId: number, nowSec: number): SeenMap {
  const next: SeenMap = new Map(seen)
  next.delete(postId)
  next.set(postId, nowSec + VIEW_DEDUPE_SECONDS)
  const entries = [...next.entries()].sort((a, b) => b[1] - a[1])
  return new Map(entries.slice(0, VIEW_COOKIE_MAX_ENTRIES))
}

/** `Set-Cookie` qiymati; `Max-Age` — eng uzoq yozuvgacha. */
export function serializeSeen(seen: SeenMap, nowSec: number, secure: boolean): string {
  const value = [...seen.entries()].map(([id, expires]) => `${id}-${expires}`).join('_')
  const maxAge = Math.max(0, ...[...seen.values()].map((expires) => expires - nowSec))
  return [
    `${VIEW_COOKIE}=${value}`,
    'Path=/api/views',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}
