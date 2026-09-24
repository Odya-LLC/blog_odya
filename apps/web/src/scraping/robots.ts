import robotsParser from 'robots-parser'

import { USER_AGENT } from './userAgent'

/**
 * `robots.txt` (TZ §2.3, TASKS M2-02): `robots-parser` bilan tekshiruv, natija 24 soat
 * keshlanadi (Postgres, `sources.robotsCache` — serverless'da xotira keshi chaqiruvlar orasida
 * saqlanmaydi). Yon ta'sirsiz qism (`evaluateRobots`, `robotsEntryFromResponse`) unit-testlanadi.
 *
 * Javob holatlari (RFC 9309 asosida, ehtiyotkor variant):
 * - `2xx` — qoidalar parse qilinadi;
 * - `404`, `410` va boshqa `4xx` — robots.txt yo'q → hammasi ruxsat;
 * - `401`, `403` — tekshirib bo'lmadi (masalan, Cloudflare challenge) → **hammasi taqiq**
 *   (RFC ruxsat beradi, lekin ToS tasdiqlanmagan manbada ehtiyot bo'lamiz);
 * - `5xx`, `429`, tarmoq xatosi/timeout — vaqtincha mavjud emas → taqiq, kesh 1 soat.
 */

/** User-agent tokeni (robots.txt `User-agent:` qatori bilan solishtiriladi). */
export const ROBOTS_AGENT = 'OdyaBlogBot'

export const ROBOTS_TTL_MS = 24 * 3_600_000
/** Xato/mavjud emas holati uchun qisqa kesh — keyingi urinishda qayta tekshiriladi. */
export const ROBOTS_ERROR_TTL_MS = 3_600_000
export const ROBOTS_FETCH_TIMEOUT_MS = 5_000
/** Google chegarasi (500 KiB) — undan keyingi qism e'tiborsiz. */
export const MAX_ROBOTS_BYTES = 500 * 1024

export type RobotsRule = 'parsed' | 'allow-all' | 'disallow-all'

export interface RobotsCacheEntry {
  /** `https://habr.com` */
  origin: string
  fetchedAt: string
  /** HTTP status; tarmoq xatosida `null`. */
  status: number | null
  rule: RobotsRule
  /** Faqat `rule = parsed` da: robots.txt matni (qisqartirilgan). */
  body?: string
  error?: string
}

/** `sources.robotsCache`: origin → yozuv. */
export type RobotsCache = Record<string, RobotsCacheEntry>

export interface RobotsDecision {
  allowed: boolean
  /** robots.txt'dagi `Crawl-delay` (soniya), bo'lsa. */
  crawlDelaySec?: number
  rule: RobotsRule
}

export function robotsUrl(pageUrl: string): string {
  return `${new URL(pageUrl).origin}/robots.txt`
}

export function robotsEntryFromResponse(
  origin: string,
  status: number | null,
  body: string | null,
  now: number,
  error?: string,
): RobotsCacheEntry {
  const base = { origin, fetchedAt: new Date(now).toISOString(), status }
  if (status !== null && status >= 200 && status < 300) {
    return { ...base, rule: 'parsed', body: (body ?? '').slice(0, MAX_ROBOTS_BYTES) }
  }
  if (status === 401 || status === 403) return { ...base, rule: 'disallow-all' }
  if (status !== null && status >= 400 && status < 500 && status !== 429) {
    return { ...base, rule: 'allow-all' }
  }
  return { ...base, rule: 'disallow-all', ...(error ? { error: error.slice(0, 300) } : {}) }
}

/** Keshdagi yozuv yangi (TTL ichida) va shu origin uchunmi. */
export function isRobotsEntryFresh(
  entry: RobotsCacheEntry | undefined | null,
  origin: string,
  now: number,
): entry is RobotsCacheEntry {
  if (!entry || entry.origin !== origin) return false
  const fetchedAt = Date.parse(entry.fetchedAt)
  if (Number.isNaN(fetchedAt)) return false
  const temporary = entry.rule === 'disallow-all' && (entry.status === null || entry.status >= 429)
  return now - fetchedAt < (temporary ? ROBOTS_ERROR_TTL_MS : ROBOTS_TTL_MS)
}

export function evaluateRobots(entry: RobotsCacheEntry, pageUrl: string): RobotsDecision {
  // Yozuv boshqa origin'ga tegishli — ehtiyot uchun taqiq.
  if (entry.origin !== new URL(pageUrl).origin) return { allowed: false, rule: 'disallow-all' }
  if (entry.rule === 'allow-all') return { allowed: true, rule: entry.rule }
  if (entry.rule === 'disallow-all') return { allowed: false, rule: entry.rule }
  const robots = robotsParser(robotsUrl(pageUrl), entry.body ?? '')
  const allowed = robots.isAllowed(pageUrl, ROBOTS_AGENT) ?? false
  const crawlDelay = robots.getCrawlDelay(ROBOTS_AGENT)
  return {
    allowed,
    rule: entry.rule,
    ...(typeof crawlDelay === 'number' && crawlDelay > 0 ? { crawlDelaySec: crawlDelay } : {}),
  }
}

export interface FetchRobotsOptions {
  fetchImpl?: typeof fetch
  now: number
  timeoutMs?: number
}

export async function fetchRobots(
  origin: string,
  options: FetchRobotsOptions,
): Promise<RobotsCacheEntry> {
  const fetchImpl = options.fetchImpl ?? fetch
  try {
    const response = await fetchImpl(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain,*/*;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(options.timeoutMs ?? ROBOTS_FETCH_TIMEOUT_MS),
    })
    const ok = response.status >= 200 && response.status < 300
    const body = ok ? await response.text() : null
    if (!ok) await response.body?.cancel().catch(() => {})
    return robotsEntryFromResponse(origin, response.status, body, options.now)
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    return robotsEntryFromResponse(origin, null, null, options.now, message)
  }
}
