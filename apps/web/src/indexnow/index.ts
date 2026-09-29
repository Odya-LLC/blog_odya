/**
 * IndexNow (TZ §8.3, OBLOG-57): chop etish / chop etishdan olish / slug (kategoriya) o'zgarishida
 * maqola URL'lari (lotin + `/kr`) `https://api.indexnow.org/indexnow` ga yuboriladi — Bing,
 * Yandex, Seznam, Naver va boshqa IndexNow ishtirokchilari bir-biriga uzatadi.
 * **Google IndexNow'ni qo'llab-quvvatlamaydi** (Google uchun — sitemap / news-sitemap).
 *
 * - Kalit — env `INDEXNOW_KEY`; kalit fayli `/{INDEXNOW_KEY}.txt` (`app/(seo)/indexnow/[key]`,
 *   `next.config.ts` rewrite). Kalit bo'lmasa — yuborilmaydi, faqat `warn` log (xato emas).
 * - Preview / `SEO_NOINDEX` (indekslash yopiq) va `https` bo'lmagan sayt manzili (lokal) —
 *   yuborilmaydi.
 * - Javob: 200/202 — qabul qilindi; 400/403/422 — qayta urinilmaydi (`warn` log: kalit fayli
 *   ochilmaydi, URL boshqa host'da va h.k.); 429/5xx/tarmoq — `indexnow.submit` job'i
 *   `waitUntil` bilan qayta navbatga (1, 5, 15 daqiqa), keyin — `warn` log. Telegram ogohlantirishi
 *   yuborilmaydi (shovqin bo'lmasin).
 *
 * Navbatga qo'yish — `collections/Posts/indexnow.ts` (`after()` bilan darhol bajariladi).
 */
import type { Payload, PayloadRequest } from 'payload'

import { env } from '@/env'
import { DEFAULT_QUEUE, INDEXNOW_RETRY_BACKOFF_MS, INDEXNOW_SUBMIT_TASK } from '@/jobs/constants'
import { isIndexingAllowed, siteOrigin } from '@/site/seo/config'

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
/** IndexNow kalit formati (indexnow.org/documentation): 8–128 belgi, `a-zA-Z0-9-`. */
export const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/
/** Bitta so'rovdagi URL'lar chegarasi (protokol — 10 000). */
export const INDEXNOW_MAX_URLS = 10_000
export const INDEXNOW_TIMEOUT_MS = 10_000

export interface IndexNowDeps {
  fetch: typeof fetch
  key: () => string | undefined
  origin: () => string
  indexingAllowed: () => boolean
  now: () => number
}

export const indexNowDeps: IndexNowDeps = {
  fetch: (...args) => fetch(...args),
  key: () => env.INDEXNOW_KEY,
  origin: () => siteOrigin(),
  indexingAllowed: () => isIndexingAllowed(),
  now: () => Date.now(),
}

/** Sozlangan va format bo'yicha to'g'ri kalit (bo'lmasa — `undefined`). */
export function indexNowKey(deps: Pick<IndexNowDeps, 'key'> = indexNowDeps): string | undefined {
  const key = deps.key()?.trim()
  return key && INDEXNOW_KEY_PATTERN.test(key) ? key : undefined
}

export function indexNowKeyLocation(origin: string, key: string): string {
  return `${origin}/${key}.txt`
}

export type IndexNowSkipReason = 'no-key' | 'indexing-disabled' | 'not-https'

/** Yuborish mumkinmi: kalit, indekslash ochiq, `https` sayt manzili. */
export function indexNowReadiness(
  deps: IndexNowDeps = indexNowDeps,
): { ok: true; key: string; origin: string } | { ok: false; reason: IndexNowSkipReason } {
  if (!deps.indexingAllowed()) return { ok: false, reason: 'indexing-disabled' }
  const key = indexNowKey(deps)
  if (!key) return { ok: false, reason: 'no-key' }
  const origin = deps.origin()
  if (!origin.startsWith('https://')) return { ok: false, reason: 'not-https' }
  return { ok: true, key, origin }
}

export const INDEXNOW_SKIP_MESSAGES: Record<IndexNowSkipReason, string> = {
  'no-key': 'IndexNow: INDEXNOW_KEY sozlanmagan — URL’lar yuborilmadi',
  'indexing-disabled': 'IndexNow: indekslash yopiq (preview / SEO_NOINDEX) — yuborilmadi',
  'not-https': 'IndexNow: sayt manzili https emas (NEXT_PUBLIC_SITE_URL) — yuborilmadi',
}

export interface IndexNowResult {
  ok: boolean
  /** HTTP status (tarmoq xatosi / timeout — 0). */
  status: number
  /** Qayta urinish ma'nosi bormi (429, 5xx, tarmoq). */
  retry: boolean
  message: string
}

const STATUS_MESSAGES: Record<number, string> = {
  200: 'qabul qilindi',
  202: 'qabul qilindi (kalit hali tekshirilmoqda)',
  400: 'noto‘g‘ri so‘rov (format)',
  403: 'kalit yaroqsiz (kalit fayli topilmadi yoki mos emas)',
  422: 'URL’lar host’ga tegishli emas yoki kalit sxemaga mos emas',
  429: 'juda ko‘p so‘rov (spam deb hisoblanishi mumkin)',
}

/** HTTP status → natija (indexnow.org/documentation "Response format"). */
export function classifyIndexNowStatus(status: number): IndexNowResult {
  const message = STATUS_MESSAGES[status] ?? `HTTP ${status}`
  if (status === 200 || status === 202) return { ok: true, status, retry: false, message }
  const retry = status === 429 || status >= 500
  return { ok: false, status, retry, message }
}

/** Takrorlarsiz, `https` URL'lar (tartib saqlanadi), protokol chegarasi bilan. */
export function normalizeIndexNowUrls(urls: readonly unknown[]): string[] {
  const unique = new Set<string>()
  for (const url of urls) {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) unique.add(url)
  }
  return [...unique].slice(0, INDEXNOW_MAX_URLS)
}

/** Bitta POST so'rov (`urlList` — bitta host URL'lari). */
export async function submitIndexNow(
  input: { urls: string[]; key: string; origin: string },
  deps: IndexNowDeps = indexNowDeps,
): Promise<IndexNowResult> {
  const host = new URL(input.origin).host
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), INDEXNOW_TIMEOUT_MS)
  try {
    const response = await deps.fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key: input.key,
        keyLocation: indexNowKeyLocation(input.origin, input.key),
        urlList: input.urls,
      }),
      signal: controller.signal,
    })
    // Tanani o'qib yopamiz (ulanish qayta ishlatilsin); mazmuni kerak emas.
    await response.text().catch(() => '')
    return classifyIndexNowStatus(response.status)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, status: 0, retry: true, message: `tarmoq xatosi: ${message}` }
  } finally {
    clearTimeout(timer)
  }
}

export interface IndexNowSubmitInput {
  urls: unknown
  /** Oldingi urinishlar soni (qayta navbatga qo'yilgan job'da). */
  attempt?: number | null
}

export interface IndexNowSubmitOutput {
  status: 'sent' | 'skipped' | 'retry' | 'failed'
  httpStatus?: number
  reason?: string
}

/** `indexnow.submit` task mantiqi. */
export async function runIndexNowSubmit(
  payload: Payload,
  input: IndexNowSubmitInput,
  options: { req?: PayloadRequest; deps?: IndexNowDeps } = {},
): Promise<IndexNowSubmitOutput> {
  const deps = options.deps ?? indexNowDeps
  const urls = normalizeIndexNowUrls(Array.isArray(input.urls) ? input.urls : [])
  if (urls.length === 0) return { status: 'skipped', reason: 'no-urls' }
  const ready = indexNowReadiness(deps)
  if (!ready.ok) {
    payload.logger.warn({ urls, msg: INDEXNOW_SKIP_MESSAGES[ready.reason] })
    return { status: 'skipped', reason: ready.reason }
  }
  const host = new URL(ready.origin).host
  const own = urls.filter((url) => new URL(url).host === host)
  if (own.length === 0) return { status: 'skipped', reason: 'foreign-host' }

  const result = await submitIndexNow({ urls: own, key: ready.key, origin: ready.origin }, deps)
  if (result.ok) {
    payload.logger.info({
      urls: own,
      httpStatus: result.status,
      msg: `IndexNow: ${own.length} ta URL yuborildi — ${result.message}`,
    })
    return { status: 'sent', httpStatus: result.status }
  }

  const attempt = Math.max(0, Number(input.attempt ?? 0) || 0)
  const backoff = INDEXNOW_RETRY_BACKOFF_MS[attempt]
  if (result.retry && backoff !== undefined) {
    await payload.jobs.queue({
      task: INDEXNOW_SUBMIT_TASK,
      queue: DEFAULT_QUEUE,
      input: { urls: own, attempt: attempt + 1 },
      waitUntil: new Date(deps.now() + backoff),
      ...(options.req ? { req: options.req } : {}),
    })
    payload.logger.warn({
      urls: own,
      httpStatus: result.status,
      msg: `IndexNow: ${result.message} — ${Math.round(backoff / 1000)} s dan keyin qayta urinish (${attempt + 1}/${INDEXNOW_RETRY_BACKOFF_MS.length})`,
    })
    return { status: 'retry', httpStatus: result.status, reason: result.message }
  }
  payload.logger.warn({
    urls: own,
    httpStatus: result.status,
    msg: `IndexNow: yuborilmadi — ${result.message}`,
  })
  return { status: 'failed', httpStatus: result.status, reason: result.message }
}
