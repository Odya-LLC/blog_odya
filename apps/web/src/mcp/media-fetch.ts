import { lookup as dnsLookup } from 'node:dns/promises'
import http, { type IncomingHttpHeaders } from 'node:http'
import https from 'node:https'
import { isIP, type LookupFunction } from 'node:net'

import {
  blockedDomainOf,
  isBlockedAddress,
  MAX_MEDIA_BYTES,
  normalizeHost,
  sniffImageFormat,
  type MediaFormat,
} from './media-policy'
import { McpToolError } from './result'

/**
 * `upload_media(url)` uchun xavfsiz yuklab olish (OBLOG-44) — SSRF himoyasi:
 *
 * - faqat `http:`/`https:`, standart portlar (80/443), URL ichida login/parol yo'q;
 * - host taqiqlangan domenlar ro'yxatida bo'lmasin (agentliklar, scraped manbalar);
 * - DNS natijasidagi **har bir** manzil ommaviy bo'lishi kerak (loopback, xususiy, link-local,
 *   bulut metadata, IPv6 ULA/link-local, IPv4-mapped … — rad etiladi). Ulanish aynan tekshirilgan
 *   manzilga qilinadi (`lookup` qotiriladi) — DNS rebinding ishlamaydi;
 * - redirect'lar qo'lda (ko'pi bilan 3 ta), har birida yuqoridagi tekshiruvlar qaytadan
 *   (yakuniy URL ham taqiqlangan domenga olib bormasligi kerak);
 * - umumiy timeout, hajm chegarasi (oqim bo'yicha — `Content-Length` ga ishonilmaydi),
 *   `Content-Type` — `image/*` (SVG emas), keyin magic bytes bo'yicha JPEG/PNG/WebP.
 */

export const FETCH_TIMEOUT_MS = 15_000
export const MAX_REDIRECTS = 3
const USER_AGENT = 'BlogOdyaMediaBot/1.0 (+https://blog.odya.uz)'

export interface ResolvedAddress {
  address: string
  family: number
}

export interface TransportResponse {
  status: number
  headers: IncomingHttpHeaders
  body: AsyncIterable<Uint8Array>
  /** Oqimni yopish (hajm oshganda yoki xato bo'lganda). */
  destroy(): void
}

export interface FetchImageDeps {
  /** DNS: host → barcha manzillar. */
  resolve?: (host: string) => Promise<ResolvedAddress[]>
  /** HTTP so'rovi aynan `address` ga (TLS/SNI — URL host'i bo'yicha). */
  transport?: (
    url: URL,
    address: ResolvedAddress,
    signal: AbortSignal,
  ) => Promise<TransportResponse>
  timeoutMs?: number
  maxBytes?: number
}

export interface FetchedImage {
  data: Buffer
  format: MediaFormat
  finalUrl: string
  /** O'tilgan barcha URL'lar (redirect'lar bilan). */
  chain: string[]
}

async function defaultResolve(host: string): Promise<ResolvedAddress[]> {
  if (isIP(host)) return [{ address: host, family: isIP(host) }]
  return dnsLookup(host, { all: true, verbatim: true })
}

function defaultTransport(
  url: URL,
  address: ResolvedAddress,
  signal: AbortSignal,
): Promise<TransportResponse> {
  const pinned: LookupFunction = (_hostname, options, callback) => {
    if ((options as { all?: boolean }).all) {
      ;(callback as unknown as (err: null, list: ResolvedAddress[]) => void)(null, [address])
    } else {
      callback(null, address.address, address.family)
    }
  }
  const client = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = client.get(
      url,
      {
        lookup: pinned,
        signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/webp,image/png,image/jpeg;q=0.9' },
        // Proxy/agent keep-alive o'rniga — bitta ulanish.
        agent: false,
      },
      (res) =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: res,
          destroy: () => res.destroy(),
        }),
    )
    req.on('error', reject)
  })
}

/** URL'ning o'zini tekshirish (tarmoqsiz): sxema, port, login, taqiqlangan domen. */
export function checkRemoteUrl(raw: string, blockedDomains: Iterable<string>): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new McpToolError(`Noto'g'ri URL: "${raw.slice(0, 120)}"`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new McpToolError('Faqat http(s):// havolalardan rasm yuklanadi.')
  }
  if (url.username || url.password) {
    throw new McpToolError("URL ichida login/parol bo'lmasligi kerak.")
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new McpToolError('Faqat standart portlar (80/443) ruxsat etiladi.')
  }
  const host = normalizeHost(url.hostname)
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new McpToolError('Ichki tarmoq manzillaridan rasm yuklab bo‘lmaydi.')
  }
  const blocked = blockedDomainOf(host, blockedDomains)
  if (blocked) {
    throw new McpToolError(
      `${host} — taqiqlangan manba (${blocked}): agentliklar, foto-banklar va yangilik ` +
        'manbalarimiz rasmlari litsenziyasiz ishlatilmaydi (copyright.md §4). Press-kit, ' +
        'Unsplash/Pexels (search_stock_images) yoki list_media dan foydalaning.',
    )
  }
  if (isIP(host) && isBlockedAddress(host)) {
    throw new McpToolError('Ichki tarmoq manzillaridan rasm yuklab bo‘lmaydi.')
  }
  return url
}

async function resolvePublic(
  host: string,
  resolve: NonNullable<FetchImageDeps['resolve']>,
): Promise<ResolvedAddress> {
  let addresses: ResolvedAddress[]
  try {
    addresses = await resolve(host)
  } catch {
    throw new McpToolError(`Host topilmadi: ${host}`)
  }
  if (!addresses.length) throw new McpToolError(`Host topilmadi: ${host}`)
  // Birorta manzil ichki bo'lsa ham — rad etiladi (aralash javob bilan aldashning oldini olish).
  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new McpToolError('Ichki tarmoq manzillaridan rasm yuklab bo‘lmaydi.')
  }
  return addresses[0]!
}

function isAllowedContentType(value: string | string[] | undefined): boolean {
  const type = (Array.isArray(value) ? value[0] : value)?.split(';')[0]?.trim().toLowerCase()
  if (!type) return false
  if (type.includes('svg')) return false
  return type.startsWith('image/') || type === 'application/octet-stream'
}

/** Rasmni xavfsiz yuklab olish (SSRF himoyasi bilan). */
export async function fetchRemoteImage(
  raw: string,
  blockedDomains: Iterable<string>,
  deps: FetchImageDeps = {},
): Promise<FetchedImage> {
  const resolve = deps.resolve ?? defaultResolve
  const transport = deps.transport ?? defaultTransport
  const maxBytes = deps.maxBytes ?? MAX_MEDIA_BYTES
  const blocked = [...blockedDomains]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? FETCH_TIMEOUT_MS)
  const chain: string[] = []
  try {
    let url = checkRemoteUrl(raw, blocked)
    for (let hop = 0; ; hop++) {
      chain.push(url.toString())
      const address = await resolvePublic(normalizeHost(url.hostname), resolve)
      let res: TransportResponse
      try {
        res = await transport(url, address, controller.signal)
      } catch {
        if (controller.signal.aborted) throw new McpToolError('Rasmni yuklab olish vaqti tugadi.')
        throw new McpToolError(`Rasmni yuklab bo'lmadi: ${url.host} ga ulanib bo'lmadi.`)
      }
      if (res.status >= 300 && res.status < 400) {
        res.destroy()
        const location = res.headers.location
        if (!location) throw new McpToolError(`Redirect manzilsiz (HTTP ${res.status}).`)
        if (hop >= MAX_REDIRECTS) throw new McpToolError("Juda ko'p redirect.")
        // Har bir redirect — qaytadan to'liq tekshiruv (sxema, domen, IP).
        url = checkRemoteUrl(new URL(location, url).toString(), blocked)
        continue
      }
      if (res.status !== 200) {
        res.destroy()
        throw new McpToolError(`Rasmni yuklab bo'lmadi: HTTP ${res.status}.`)
      }
      if (!isAllowedContentType(res.headers['content-type'])) {
        res.destroy()
        throw new McpToolError(
          `Ruxsat etilmagan Content-Type: ${String(res.headers['content-type'] ?? '—')} ` +
            '(faqat JPEG, PNG, WebP; SVG — yo‘q).',
        )
      }
      const declared = Number(res.headers['content-length'])
      if (Number.isFinite(declared) && declared > maxBytes) {
        res.destroy()
        throw new McpToolError(tooLarge(maxBytes))
      }
      const chunks: Buffer[] = []
      let size = 0
      try {
        for await (const chunk of res.body) {
          size += chunk.length
          if (size > maxBytes) {
            res.destroy()
            throw new McpToolError(tooLarge(maxBytes))
          }
          chunks.push(Buffer.from(chunk))
        }
      } catch (error) {
        if (error instanceof McpToolError) throw error
        if (controller.signal.aborted) throw new McpToolError('Rasmni yuklab olish vaqti tugadi.')
        throw new McpToolError("Rasmni yuklab olishda uzilish bo'ldi.")
      }
      const data = Buffer.concat(chunks)
      const format = sniffImageFormat(data)
      if (!format) {
        throw new McpToolError('Fayl JPEG, PNG yoki WebP emas (SVG, GIF va boshqalar — yo‘q).')
      }
      return { data, format, finalUrl: url.toString(), chain }
    }
  } finally {
    clearTimeout(timer)
  }
}

export function tooLarge(maxBytes: number): string {
  return `Fayl juda katta: ko'pi bilan ${Math.round(maxBytes / 1024 / 1024)} MB.`
}
