/**
 * Ko'rishlar hisoblagichi (OBLOG-69): qaysi so'rov hisobga olinmaydi. Yon ta'sirsiz (testlanadi).
 *
 * - Botlar, link preview'lar, monitoringlar va headless brauzerlar (Lighthouse, Playwright) —
 *   User-Agent bo'yicha; bo'sh UA ham bot. `(?<!cu)bot` — "Cubot" telefonlari bot emas.
 * - Prefetch/prerender (`Purpose`/`Sec-Purpose: prefetch`).
 * - Boshqa saytdan yuborilgan so'rov: `Sec-Fetch-Site` ≠ `same-origin` yoki `Origin` xosti
 *   so'rov xostiga mos emas (begona sahifa bizning hisoblagichni "puflay" olmasin). Sarlavhalar
 *   umuman bo'lmasa (eski brauzer) — ruxsat.
 */

const BOT_UA =
  /(?<!cu)bot|crawl|spider|slurp|scrap|preview|lighthouse|headless|phantomjs|puppeteer|playwright|selenium|facebookexternalhit|facebookcatalog|embedly|whatsapp|telegram|discord|skype|vkshare|pinterest|google-|googleother|mediapartners|feedfetcher|monitor|uptime|pingdom|statuscake|curl\/|wget|python|httpx|aiohttp|axios|node-fetch|undici|go-http|java\/|okhttp|httpclient|libwww|postman|insomnia|vercel/i

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim()
  if (!ua) return true
  return BOT_UA.test(ua)
}

export function isPrefetch(headers: Headers): boolean {
  const purpose = `${headers.get('purpose') ?? ''} ${headers.get('sec-purpose') ?? ''}`
  return /prefetch|prerender/i.test(purpose)
}

/** So'rov shu saytning o'z sahifasidan kelganmi (CSRF-ga o'xshash "puflash"dan himoya). */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  if (origin === 'null') return false
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return new URL(origin).host === (host ?? new URL(request.url).host)
  } catch {
    return false
  }
}

export type SkipReason = 'bot' | 'prefetch' | 'cross-site'

/** `null` — hisoblash mumkin. */
export function skipReason(request: Request): SkipReason | null {
  if (isBotUserAgent(request.headers.get('user-agent'))) return 'bot'
  if (isPrefetch(request.headers)) return 'prefetch'
  if (!isSameOrigin(request)) return 'cross-site'
  return null
}
