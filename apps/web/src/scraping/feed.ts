import Parser from 'rss-parser'

import { USER_AGENT } from './userAgent'

/**
 * RSS/Atom feed'ni yuklash va parse qilish (`feed.poll`, TZ §3.5).
 * `ETag` / `Last-Modified` bilan shartli so'rov: o'zgarmagan feed `304` qaytaradi — trafik va
 * parse vaqti tejaladi.
 */

/** O'z User-Agent'imiz (TZ §2.3) — `./userAgent` (sayt sahifalari rss-parser'siz import qiladi). */
export { USER_AGENT }

/** Feed javobining maksimal hajmi — undan kattasi xato (xotira va vaqtni himoya qilish). */
export const MAX_FEED_BYTES = 5 * 1024 * 1024

/** Workflow input'iga uzatiladigan RSS matni chegarasi (payload-jobs jadvalini shishirmaslik uchun). */
export const MAX_CONTENT_HTML_CHARS = 100_000

export const MAX_EXCERPT_CHARS = 1_000

export interface FeedValidators {
  etag?: string | null
  lastModified?: string | null
}

export interface FeedItem {
  /** Asl havola (normallashtirilmagan). */
  link: string
  guid?: string
  title?: string
  publishedAt?: string
  author?: string
  /** Oddiy matn (HTML teglarsiz), qisqartirilgan. */
  excerpt?: string
  /** RSS'dagi to'liq/qisman HTML (`content:encoded` yoki `content`), qisqartirilgan. */
  contentHtml?: string
  categories: string[]
}

export type FeedFetchResult =
  | { status: 'not-modified'; httpStatus: 304 }
  | {
      status: 'ok'
      httpStatus: number
      etag: string | null
      lastModified: string | null
      items: FeedItem[]
    }

/**
 * Feed xatosi turi (`feeds[].lastErrorKind`, OBLOG-53) — backoff va ogohlantirish shunga qarab
 * (`src/scraping/feedBackoff.ts`):
 * - `cloudflare` — Cloudflare challenge (JS/CAPTCHA). Chetlab o'tilmaydi (docs/sources.md §3.5b),
 *   shuning uchun darhol kuniga 1 marta tekshiruvga o'tiladi;
 * - `http` (boshqa 4xx/5xx), `timeout`, `network`, `parse` — eksponensial backoff.
 */
export const FEED_ERROR_KINDS = ['cloudflare', 'http', 'timeout', 'network', 'parse'] as const
export type FeedErrorKind = (typeof FEED_ERROR_KINDS)[number]

export class FeedHttpError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
    readonly kind: FeedErrorKind = 'http',
  ) {
    super(message)
    this.name = 'FeedHttpError'
  }
}

/** Challenge sahifasini aniqlash uchun tanadan o'qiladigan maksimal hajm. */
const CHALLENGE_SNIFF_BYTES = 64 * 1024

const CHALLENGE_MARKERS = [
  /<title>\s*Just a moment\.\.\.\s*<\/title>/i,
  /\/cdn-cgi\/challenge-platform\//i,
  /window\._cf_chl_opt/i,
]

function isCloudflareServer(headers: Headers): boolean {
  return /cloudflare/i.test(headers.get('server') ?? '')
}

/**
 * Cloudflare challenge'mi (managed / JS / CAPTCHA): `cf-mitigated: challenge` sarlavhasi (rasmiy
 * belgi) yoki `403`/`503` + `server: cloudflare` + challenge HTML belgilari. Oddiy 403 (WAF bloki,
 * origin'ning o'z 403 sahifasi) challenge emas — u oddiy `http` xato sifatida backoff oladi.
 */
export function isCloudflareChallenge(
  status: number,
  headers: Headers,
  bodySnippet: string | null,
): boolean {
  if (headers.get('cf-mitigated')?.trim().toLowerCase() === 'challenge') return true
  if (status !== 403 && status !== 503) return false
  if (!isCloudflareServer(headers)) return false
  return Boolean(bodySnippet && CHALLENGE_MARKERS.some((marker) => marker.test(bodySnippet)))
}

/** Javob tanasining boshini (≤ `maxBytes`) o'qiydi, qolganini bekor qiladi. */
async function readSnippet(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0
  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      text += decoder.decode(value, { stream: true })
    }
  } catch {
    // Tana o'qilmasa — sarlavhalar bo'yicha qaror qilinadi.
  } finally {
    await reader.cancel().catch(() => {})
  }
  return text
}

/** Shartli so'rov sarlavhalari: `If-None-Match` (ETag) va `If-Modified-Since` (Last-Modified). */
export function buildConditionalHeaders(validators: FeedValidators = {}): Record<string, string> {
  const headers: Record<string, string> = {}
  if (validators.etag) headers['If-None-Match'] = validators.etag
  if (validators.lastModified) headers['If-Modified-Since'] = validators.lastModified
  return headers
}

export interface FetchFeedOptions extends FeedValidators {
  timeoutMs: number
  fetchImpl?: typeof fetch
}

export async function fetchFeed(url: string, options: FetchFeedOptions): Promise<FeedFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
      ...buildConditionalHeaders(options),
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(Math.max(1, options.timeoutMs)),
  })

  if (response.status === 304) {
    await response.body?.cancel().catch(() => {})
    return { status: 'not-modified', httpStatus: 304 }
  }
  if (!response.ok) {
    const httpText = `HTTP ${response.status} ${response.statusText}`.trim()
    // Tana faqat Cloudflare challenge ehtimoli bo'lsa o'qiladi (≤ 64 KB), aks holda bekor.
    const sniff =
      (response.status === 403 || response.status === 503) &&
      isCloudflareServer(response.headers) &&
      response.headers.get('cf-mitigated') === null
    const snippet = sniff ? await readSnippet(response, CHALLENGE_SNIFF_BYTES) : null
    if (!sniff) await response.body?.cancel().catch(() => {})
    if (isCloudflareChallenge(response.status, response.headers, snippet)) {
      throw new FeedHttpError(response.status, `${httpText} (Cloudflare challenge)`, 'cloudflare')
    }
    throw new FeedHttpError(response.status, httpText)
  }

  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_FEED_BYTES) {
    await response.body?.cancel().catch(() => {})
    throw new FeedHttpError(response.status, `Feed juda katta: ${declared} bayt`)
  }
  const xml = await response.text()
  if (xml.length > MAX_FEED_BYTES) {
    throw new FeedHttpError(response.status, `Feed juda katta: ${xml.length} belgi`)
  }

  let items: FeedItem[]
  try {
    items = await parseFeed(xml)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new FeedHttpError(response.status, `Feed parse xatosi: ${message}`.slice(0, 500), 'parse')
  }

  return {
    status: 'ok',
    httpStatus: response.status,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    items,
  }
}

type RawItem = Parser.Item & {
  'content:encoded'?: string
  'dc:creator'?: string
  author?: unknown
  summary?: string
  id?: string
  categories?: unknown[]
}

const parser = new Parser<Record<string, unknown>, RawItem>({
  customFields: { item: ['content:encoded', 'dc:creator', 'author', 'summary', 'id'] },
})

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (Array.isArray(value)) return text(value[0])
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return text(record.name ?? record._ ?? record['#'])
  }
  return undefined
}

function categoryText(value: unknown): string | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as { $?: { term?: string }; _?: string }
    return text(record._ ?? record.$?.term)
  }
  return text(value)
}

/** HTML → oddiy matn (excerpt uchun; to'liq ajratish — `item.extract`, M2-02). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const time = Date.parse(value)
  return Number.isNaN(time) ? undefined : new Date(time).toISOString()
}

export async function parseFeed(xml: string): Promise<FeedItem[]> {
  const feed = await parser.parseString(xml)
  const items: FeedItem[] = []
  for (const raw of feed.items ?? []) {
    const guid = text(raw.guid) ?? text(raw.id)
    const link = text(raw.link) ?? (guid && /^https?:\/\//i.test(guid) ? guid : undefined)
    if (!link) continue
    const contentHtml = text(raw['content:encoded']) ?? text(raw.content)
    const summary = raw.contentSnippet ?? text(raw.summary) ?? contentHtml
    items.push({
      link,
      guid,
      title: text(raw.title) ? htmlToText(text(raw.title) ?? '') : undefined,
      publishedAt: isoDate(raw.isoDate ?? raw.pubDate),
      author: text(raw.creator) ?? text(raw['dc:creator']) ?? text(raw.author),
      excerpt: truncate(summary ? htmlToText(summary) : undefined, MAX_EXCERPT_CHARS),
      contentHtml: truncate(contentHtml, MAX_CONTENT_HTML_CHARS),
      categories: [
        ...new Set(
          (raw.categories ?? [])
            .map(categoryText)
            .filter((c): c is string => Boolean(c))
            .map((c) => c.slice(0, 100)),
        ),
      ],
    })
  }
  return items
}
