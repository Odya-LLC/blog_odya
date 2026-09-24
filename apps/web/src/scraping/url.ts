import { createHash } from 'node:crypto'

/**
 * URL normallashtirish va `urlHash` (TZ §3.5, §10.2): bir xil maqola turli ko'rinishdagi
 * havolalar bilan kelsa ham (utm parametrlari, `#fragment`, oxiridagi `/`, katta-kichik harfli
 * host) bitta `urlHash` beradi — dedupe shu hash bo'yicha.
 */

/** Kuzatuv (tracking) parametrlari — maqola mazmuniga ta'sir qilmaydi, olib tashlanadi. */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'yclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'ref',
  'ref_src',
  'rss',
  'from',
])

const TRACKING_PREFIXES = ['utm_', '__twitter', 'guccounter', 'guce_']

export function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase()
  return TRACKING_PARAMS.has(key) || TRACKING_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/**
 * Havolani kanonik ko'rinishga keltiradi:
 * - faqat `http:`/`https:`; sxema va host kichik harflarda, standart port olib tashlanadi;
 * - `#fragment` va tracking parametrlari (`utm_*`, `fbclid`, ...) olib tashlanadi;
 * - qolgan query parametrlari kalit bo'yicha saralanadi (tartib farqi — bir xil URL);
 * - yo'l oxiridagi `/` olib tashlanadi (ildiz `/` bundan mustasno), `//` → `/`.
 *
 * Noto'g'ri URL bo'lsa `null` qaytaradi.
 */
export function normalizeUrl(input: string, base?: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim(), base)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  url.hash = ''
  url.username = ''
  url.password = ''
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = ''
  }

  const params = [...url.searchParams.entries()]
    .filter(([key]) => !isTrackingParam(key))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a < b ? -1 : 1))
  url.search = ''
  for (const [key, value] of params) url.searchParams.append(key, value)

  let pathname = url.pathname.replace(/\/{2,}/g, '/')
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '')
  url.pathname = pathname || '/'

  return url.toString()
}

/** SHA-256 (hex) normallashtirilgan URL'dan. */
export function urlHash(normalizedUrl: string): string {
  return createHash('sha256').update(normalizedUrl).digest('hex')
}

/** Normallashtirish + hash; noto'g'ri URL bo'lsa `null`. */
export function hashUrl(input: string, base?: string): { url: string; hash: string } | null {
  const url = normalizeUrl(input, base)
  return url ? { url, hash: urlHash(url) } : null
}
