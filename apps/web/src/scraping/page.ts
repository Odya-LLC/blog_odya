import { USER_AGENT } from './userAgent'

/**
 * Maqola sahifasini yuklash (`item.fetch`, TZ §3.5): oddiy HTTP (JS'siz), o'z User-Agent'imiz,
 * timeout, hajm chegarasi, kodirovkani aniqlash (UTF-8 / windows-1251 va h.k.).
 * Paywall/login orqali kirish yo'q — cookie va avtorizatsiya yuborilmaydi (TZ §2.3).
 */

/** Sahifa so'rovi uchun maksimal timeout (TASKS M2-02: 15 s). */
export const PAGE_FETCH_TIMEOUT_MS = 15_000

/** HTML javobining maksimal hajmi (bayt). */
export const MAX_PAGE_BYTES = 5 * 1024 * 1024

export class PageFetchError extends Error {
  constructor(
    message: string,
    /** HTTP status (tarmoq xatosida — `null`). */
    readonly httpStatus: number | null,
    /** `true` — qayta urinish foydasiz (404, 410, HTML emas, juda katta). */
    readonly permanent: boolean,
  ) {
    super(message)
    this.name = 'PageFetchError'
  }
}

export interface FetchedPage {
  httpStatus: number
  /** Yo'naltirishlardan keyingi URL. */
  finalUrl: string
  contentType: string | null
  charset: string
  html: string
  bytes: number
  etag: string | null
  lastModified: string | null
}

export interface FetchPageOptions {
  timeoutMs: number
  fetchImpl?: typeof fetch
}

const HTML_TYPES = /^(text\/html|application\/xhtml\+xml)\b/i

function charsetFromContentType(contentType: string | null): string | undefined {
  return contentType?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
}

/** `<meta charset>` / `http-equiv` — birinchi 4 KB ichida (HTML spetsifikatsiyasi bo'yicha 1024). */
function charsetFromMeta(bytes: Uint8Array): string | undefined {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096))
  return (
    head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1] ??
    head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset=([\w-]+)/i)?.[1]
  )
}

export function decodeHtml(
  bytes: Uint8Array,
  contentType: string | null,
): { html: string; charset: string } {
  const candidates = [charsetFromContentType(contentType), charsetFromMeta(bytes), 'utf-8']
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const decoder = new TextDecoder(candidate.toLowerCase())
      return { html: decoder.decode(bytes), charset: decoder.encoding }
    } catch {
      // Noma'lum kodirovka — keyingisini sinaymiz.
    }
  }
  return { html: new TextDecoder().decode(bytes), charset: 'utf-8' }
}

async function readLimited(response: Response, limit: number): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => {})
      throw new PageFetchError(`Sahifa juda katta: > ${limit} bayt`, response.status, true)
    }
    chunks.push(value)
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

export async function fetchPage(url: string, options: FetchPageOptions): Promise<FetchedPage> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      'Accept-Language': 'en,ru;q=0.8',
    },
    redirect: 'follow',
    credentials: 'omit',
    signal: AbortSignal.timeout(Math.max(1, options.timeoutMs)),
  })

  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    // 4xx (429 dan tashqari) — qayta urinish natija bermaydi; 5xx va 429 — retry.
    const permanent = response.status >= 400 && response.status < 500 && response.status !== 429
    throw new PageFetchError(
      `HTTP ${response.status} ${response.statusText}`.trim(),
      response.status,
      permanent,
    )
  }

  const contentType = response.headers.get('content-type')
  if (contentType && !HTML_TYPES.test(contentType)) {
    await response.body?.cancel().catch(() => {})
    throw new PageFetchError(`HTML emas: ${contentType}`, response.status, true)
  }
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_PAGE_BYTES) {
    await response.body?.cancel().catch(() => {})
    throw new PageFetchError(`Sahifa juda katta: ${declared} bayt`, response.status, true)
  }

  const bytes = await readLimited(response, MAX_PAGE_BYTES)
  const { html, charset } = decodeHtml(bytes, contentType)
  return {
    httpStatus: response.status,
    finalUrl: response.url || url,
    contentType,
    charset,
    html,
    bytes: bytes.byteLength,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  }
}
