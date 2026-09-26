import { lookup as dnsLookup } from 'node:dns/promises'
import http, { type IncomingHttpHeaders } from 'node:http'
import https from 'node:https'
import { isIP, type LookupFunction } from 'node:net'

import { limitsFromEnv } from '@/env.schema'

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
 * - timeout'lar (ulanish / tana / umumiy — `fetchRemoteImage`), hajm chegarasi (oqim bo'yicha — `Content-Length` ga ishonilmaydi),
 *   `Content-Type` — `image/*` (SVG emas), keyin magic bytes bo'yicha JPEG/PNG/WebP.
 */

/**
 * `upload_media(url)` yuklab olishining umumiy chegarasi (redirect'lar va qayta urinish bilan) —
 * env qanday bo'lmasin, shundan oshmaydi. Byudjet: 90 s yuklab olish + ~30 s qayta ishlash (sharp,
 * WebP variantlar, R2) = `/api/mcp` `maxDuration` 120 s (`MCP_MAX_DURATION`).
 */
export const MAX_FETCH_BUDGET_MS = 90_000
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
  /** Tanani o'qish timeout'i, ms (standart — `MCP_MEDIA_FETCH_TIMEOUT_MS`, 45 s). */
  timeoutMs?: number
  /** DNS + ulanish + sarlavhalar (har bir so'rov), ms (standart — `MCP_MEDIA_CONNECT_TIMEOUT_MS`, 10 s). */
  connectTimeoutMs?: number
  /** Umumiy chegara, ms (standart — `tana + 2 × ulanish`, ≤ {@link MAX_FETCH_BUDGET_MS}). */
  totalTimeoutMs?: number
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

/** Node `http(s)` transporti — ulanish aynan `address` ga (standart; testlar ham ishlatadi). */
export function httpTransport(
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

type AbortReason = 'connect' | 'body' | 'total'

/**
 * Yuklab olish xatosi. `retryable` — ulanish/birinchi javob kutilmadi yoki ulanish tana to'liq
 * kelmasdan uzildi (bitta qayta urinish mumkin); hajm/format/SSRF xatolari — qayta urinilmaydi.
 */
class FetchFailure extends McpToolError {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

function seconds(ms: number): string {
  return String(Number((ms / 1000).toFixed(2)))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bayt`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** `promise` yoki `signal` bekor qilinishi — qaysi biri oldin bo'lsa (soxta transport ham to'xtaydi). */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => undefined)
    return Promise.reject(new Error('aborted'))
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

/** Env (OBLOG-46) + test o'rnini bosuvchilari → amaldagi timeout'lar. */
export function resolveFetchTimeouts(
  deps: Pick<FetchImageDeps, 'timeoutMs' | 'connectTimeoutMs' | 'totalTimeoutMs'> = {},
) {
  const limits = limitsFromEnv()
  const connectMs = deps.connectTimeoutMs ?? limits.mediaConnectTimeoutMs
  const bodyMs = deps.timeoutMs ?? limits.mediaFetchTimeoutMs
  // Bitta qayta urinish uchun yana bitta ulanish oynasi; umumiy — MAX_FETCH_BUDGET_MS dan oshmaydi.
  const totalMs = deps.totalTimeoutMs ?? Math.min(bodyMs + 2 * connectMs, MAX_FETCH_BUDGET_MS)
  return { connectMs, bodyMs, totalMs }
}

type HopOutcome =
  { kind: 'redirect'; location: string; status: number } | { kind: 'done'; data: Buffer }

/**
 * Rasmni xavfsiz yuklab olish (SSRF himoyasi bilan).
 *
 * Timeout'lar (OBLOG-46; env — `MCP_MEDIA_CONNECT_TIMEOUT_MS`, `MCP_MEDIA_FETCH_TIMEOUT_MS`):
 * - **ulanish** (standart 10 s) — har bir so'rov uchun alohida: DNS + TCP/TLS + javob sarlavhalari.
 *   Javob bermayotgan host tez rad etiladi;
 * - **tana** (standart 45 s) — sarlavhalardan keyin butun faylni o'qish (sekin press-saytlar:
 *   1,6 MB ~17 s);
 * - **umumiy** — `tana + 2 × ulanish`, lekin ≤ {@link MAX_FETCH_BUDGET_MS} (redirect'lar va qayta
 *   urinish bilan birga). Route `maxDuration` — shu byudjet + qayta ishlash (sharp, WebP, R2).
 *
 * Qayta urinish — ko'pi bilan bitta: ulanish/birinchi javob kutilmasa yoki ulanish tana to'liq
 * kelmasdan uzilsa, va umumiy byudjetda kamida bitta ulanish oynasi qolgan bo'lsa. Tana sekinligi
 * (tana timeout'i), HTTP xatolar, hajm/format/SSRF — qayta urinilmaydi.
 */
export async function fetchRemoteImage(
  raw: string,
  blockedDomains: Iterable<string>,
  deps: FetchImageDeps = {},
): Promise<FetchedImage> {
  const resolve = deps.resolve ?? defaultResolve
  const transport = deps.transport ?? httpTransport
  const maxBytes = deps.maxBytes ?? MAX_MEDIA_BYTES
  const now = Date.now
  const { connectMs, bodyMs, totalMs } = resolveFetchTimeouts(deps)
  const blocked = [...blockedDomains]
  const deadline = now() + totalMs
  const chain: string[] = []

  /** Bitta so'rov (bitta hop, bitta urinish). */
  const attempt = async (url: URL): Promise<HopOutcome> => {
    const host = url.host
    const controller = new AbortController()
    let reason: AbortReason | undefined
    const abort = (why: AbortReason) => {
      reason ??= why
      controller.abort()
    }
    const totalTimer = setTimeout(() => abort('total'), Math.max(0, deadline - now()))
    let phaseTimer = setTimeout(() => abort('connect'), connectMs)
    let res: TransportResponse | undefined
    let received = 0
    let declared: number | undefined
    const timeoutFailure = (): FetchFailure => {
      if (reason === 'connect' || !res) {
        const limit = reason === 'connect' ? connectMs : totalMs
        return new FetchFailure(
          `Rasmni yuklab boʻlmadi: ${host} ${seconds(limit)} s ichida javob bermadi ` +
            '(server ulanishga yoki soʻrovga javob qaytarmadi).',
          reason === 'connect',
        )
      }
      const limit = reason === 'body' ? bodyMs : totalMs
      const got = declared
        ? `${formatBytes(received)} / ${formatBytes(declared)}`
        : formatBytes(received)
      return new FetchFailure(
        `Rasmni yuklab olish juda sekin: ${host} dan ${seconds(limit)} s ichida faqat ${got} ` +
          'keldi. Kichikroq variant havolasini bering yoki keyinroq urinib koʻring.',
        false,
      )
    }
    try {
      const address = await raceAbort(
        resolvePublic(normalizeHost(url.hostname), resolve),
        controller.signal,
      ).catch((error: unknown) => {
        if (reason) throw timeoutFailure()
        throw error
      })
      try {
        res = await raceAbort(transport(url, address, controller.signal), controller.signal)
      } catch {
        if (reason) throw timeoutFailure()
        throw new FetchFailure(`Rasmni yuklab boʻlmadi: ${host} ga ulanib boʻlmadi.`, true)
      }
      clearTimeout(phaseTimer)
      if (res.status >= 300 && res.status < 400) {
        res.destroy()
        const location = res.headers.location
        if (!location) throw new McpToolError(`Redirect manzilsiz (HTTP ${res.status}).`)
        return { kind: 'redirect', location, status: res.status }
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
      const length = Number(res.headers['content-length'])
      if (Number.isFinite(length) && length > 0) declared = length
      if (declared !== undefined && declared > maxBytes) {
        res.destroy()
        throw new McpToolError(tooLarge(maxBytes))
      }
      phaseTimer = setTimeout(() => abort('body'), bodyMs)
      const chunks: Buffer[] = []
      const iterator = res.body[Symbol.asyncIterator]()
      try {
        for (;;) {
          const next = await raceAbort(iterator.next(), controller.signal)
          if (next.done) break
          received += next.value.length
          if (received > maxBytes) {
            res.destroy()
            throw new McpToolError(tooLarge(maxBytes))
          }
          chunks.push(Buffer.from(next.value))
        }
      } catch (error) {
        if (error instanceof McpToolError) throw error
        res.destroy()
        if (reason) throw timeoutFailure()
        throw new FetchFailure(
          `Rasmni yuklab olishda uzilish: ${host} ulanishni uzdi (${formatBytes(received)} olindi).`,
          true,
        )
      }
      return { kind: 'done', data: Buffer.concat(chunks) }
    } finally {
      clearTimeout(phaseTimer)
      clearTimeout(totalTimer)
      if (reason) res?.destroy()
    }
  }

  let url = checkRemoteUrl(raw, blocked)
  let retried = false
  for (let hop = 0; ;) {
    if (chain.at(-1) !== url.toString()) chain.push(url.toString())
    let outcome: HopOutcome
    try {
      outcome = await attempt(url)
    } catch (error) {
      // Bitta qayta urinish — faqat tarmoq nosozligida va byudjetda ulanish oynasi qolgan bo'lsa.
      if (
        error instanceof FetchFailure &&
        error.retryable &&
        !retried &&
        deadline - now() > connectMs
      ) {
        retried = true
        continue
      }
      throw error
    }
    if (outcome.kind === 'redirect') {
      if (hop >= MAX_REDIRECTS) throw new McpToolError("Juda ko'p redirect.")
      hop++
      // Har bir redirect — qaytadan to'liq tekshiruv (sxema, domen, IP).
      url = checkRemoteUrl(new URL(outcome.location, url).toString(), blocked)
      continue
    }
    const format = sniffImageFormat(outcome.data)
    if (!format) {
      throw new McpToolError('Fayl JPEG, PNG yoki WebP emas (SVG, GIF va boshqalar — yo‘q).')
    }
    return { data: outcome.data, format, finalUrl: url.toString(), chain }
  }
}

export function tooLarge(maxBytes: number): string {
  return `Fayl juda katta: ko'pi bilan ${Math.round(maxBytes / 1024 / 1024)} MB.`
}
