import { createHmac } from 'node:crypto'
import { isIPv4, isIPv6 } from 'node:net'

import { localDate } from '@/editorial/queue'
import type { PageviewLimits } from '@/env.schema'

import { VIEW_DEDUPE_SECONDS } from './dedupe'

/**
 * `POST /api/views` uchun IP bo'yicha himoya (OBLOG-71) — yon ta'sirsiz qism (testlanadi);
 * DB qismi — `store.recordView` (`guard` bilan), jadval `post_view_limits`.
 *
 * Cookie dedupe (`dedupe.ts`) cookie'siz skriptni to'xtatmaydi, shuning uchun har ko'rish
 * (cookie dedupe'dan o'tgani) qo'shimcha ravishda IP bo'yicha tekshiriladi:
 *
 * 1. **Takror (30 daqiqa):** bir xil IP + User-Agent + Accept-Language + post — 30 daqiqada bir
 *    marta (sirpanuvchi oyna). UA hisobga olinadi, chunki bir IP ortida (ofis, mobil operator CGNAT —
 *    O'zbekistonda keng tarqalgan) bir maqolani ko'p real o'quvchi o'qiydi; faqat IP + post bo'yicha
 *    kesish ularni kam sanardi. Narxi: bir NAT ortida bir xil brauzer versiyasidagi ikki o'quvchi
 *    30 daqiqa ichida bitta deb sanaladi (Chrome UA reduction tufayli UA'lar o'xshash) — kam
 *    sanashning kichik, yuqoriga emas, pastga og'ishi.
 * 2. **Bitta IP → bitta post:** soatiga `perPostHour` (standart 30) — UA'ni aylantirib bitta
 *    postni "puflash"ga qarshi.
 * 3. **Bitta IP → barcha postlar:** soatiga `perHour` (300) va sutkada `perDay` (1500) — post
 *    ID'larini aylantiruvchi skriptga qarshi. NAT ortidagi o'quvchilarni kesmaslik uchun saxiy.
 *
 * Limitlar (2–3) **urinishlarni** sanaydi (takrorlar ham kiradi) va oshganda shu oyna tugaguncha
 * ko'rish hisoblanmaydi; javob baribir `204`. Noma'lum/chop etilmagan post hech narsa yozmaydi.
 * IPv6 — /64 tarmoq bo'yicha (bitta abonent odatda butun /64 oladi va manzilni aylantira oladi).
 *
 * **Maxfiylik:** IP saqlanmaydi. Kalit — `HMAC-SHA256(kunlik_kalit, tur + IP + …)` ning 16 bayti,
 * `kunlik_kalit = HMAC-SHA256(PAYLOAD_SECRET, sana)`: teskari tiklab bo'lmaydi, kunlar o'rtasida
 * bog'lab bo'lmaydi. Qatorlar muddati (≤ 24 soat) o'tgach o'chiriladi — ba'zi so'rovlarda
 * (`VIEW_LIMITS_PRUNE_PROBABILITY`) va `maintenance.cleanup` da (kechi bilan ~48 soat).
 *
 * IP topilmasa (lokal, noma'lum proxy) — IP tekshiruvlari o'tkazib yuboriladi, faqat cookie dedupe.
 */

const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS
const KEY_BYTES = 16

/** Shu ehtimollik bilan ko'rishdan keyin muddati o'tgan qatorlar tozalanadi (alohida so'rov). */
export const VIEW_LIMITS_PRUNE_PROBABILITY = 0.02
/** Bitta tozalashda ko'pi bilan shuncha qator (so'rov qisqa bo'lsin). */
export const VIEW_LIMITS_PRUNE_BATCH = 1000

export interface ViewLimitCounter {
  /** 16 bayt, hex. */
  key: string
  expiresAt: Date
  max: number
}

export interface ViewGuard {
  /** Tekshiruv vaqti (DB'dagi `expires_at` lar shu bilan solishtiriladi). */
  at: Date
  /** IP + UA + post — 30 daqiqalik takror. */
  dedupe: { key: string; expiresAt: Date }
  /** Hisoblagichlar: IP+post/soat, IP/soat, IP/sutka. */
  counters: ViewLimitCounter[]
}

/** `1.2.3.4:5678`, `[2001:db8::1]:443`, `"…"` kabi ko'rinishlardan toza IP; noto'g'ri — `null`. */
export function normalizeIp(value: string | null | undefined): string | null {
  let text = value?.trim().replace(/^"|"$/g, '') ?? ''
  if (!text) return null
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(text)
  if (bracketed) text = bracketed[1]!
  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(text)
  if (v4WithPort) text = v4WithPort[1]!
  const zone = text.indexOf('%')
  if (zone >= 0) text = text.slice(0, zone)
  if (isIPv4(text)) return text
  if (isIPv6(text)) return text.toLowerCase()
  return null
}

/**
 * Mijoz IP'si. Tartib: `x-vercel-forwarded-for` (Vercel yozadi, mijoz soxtalashtira olmaydi),
 * `x-real-ip` (Vercel; nginx'da odatda `$remote_addr`), `x-forwarded-for` ning birinchi qiymati.
 * Vercel'dan tashqarida XFF ning birinchi qiymatini mijoz yozishi mumkin — reverse proxy
 * `x-real-ip` ni o'rnatishi kerak (README → "Ko'rishlar hisoblagichi").
 */
export function clientIp(headers: Headers): string | null {
  for (const name of ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']) {
    const ip = normalizeIp(headers.get(name)?.split(',')[0])
    if (ip) return ip
  }
  return null
}

/** IPv6 → 8 ta 16-bitli guruh; noto'g'ri — `null`. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase()
  if (!isIPv6(text)) return null
  const lastColon = text.lastIndexOf(':')
  const tail = text.slice(lastColon + 1)
  if (tail.includes('.')) {
    const [a, b, c, d] = tail.split('.').map(Number) as [number, number, number, number]
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const parts = text.split('::')
  if (parts.length > 2) return null
  const head = parts[0] ? parts[0].split(':') : []
  const rest = parts.length === 2 ? (parts[1] ? parts[1].split(':') : []) : null
  const groups =
    rest === null
      ? head
      : [...head, ...Array<string>(8 - head.length - rest.length).fill('0'), ...rest]
  if (groups.length !== 8) return null
  return groups.map((group) => parseInt(group, 16))
}

/**
 * Limit "chelagi": IPv4 — manzilning o'zi; IPv6 — /64 tarmoq (`2001:db8:1:2::/64`);
 * IPv4-mapped IPv6 (`::ffff:1.2.3.4`) — IPv4.
 */
export function ipBucket(ip: string): string {
  if (isIPv4(ip)) return ip
  const groups = ipv6Groups(ip)
  if (!groups) return ip
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const [g6, g7] = [groups[6]!, groups[7]!]
    return `${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`
}

/** Kunlik kalit: sir + sana (Toshkent). Sana almashsa — barcha xeshlar o'zgaradi. */
export function dailyHashKey(secret: string, day: string): Buffer {
  return createHmac('sha256', secret).update(`blog-odya:pageviews:${day}`).digest()
}

/** Bir tomonlama kalit (16 bayt hex): `parts` — tur va IP chelagi va h.k. */
export function limitKey(dailyKey: Buffer, parts: ReadonlyArray<string | number>): string {
  return createHmac('sha256', dailyKey)
    .update(parts.join('\n'))
    .digest()
    .subarray(0, KEY_BYTES)
    .toString('hex')
}

/** Toshkent sanasi `day` tugaydigan lahza (keyingi kun 00:00 +05:00). */
function endOfLocalDay(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00+05:00`) + DAY_MS)
}

export interface BuildViewGuardInput {
  headers: Headers
  postId: number
  nowMs: number
  secret: string
  limits: PageviewLimits
}

/** IP topilmasa — `null` (IP tekshiruvlarisiz). */
export function buildViewGuard(input: BuildViewGuardInput): ViewGuard | null {
  const ip = clientIp(input.headers)
  if (!ip) return null
  const bucket = ipBucket(ip)
  const at = new Date(input.nowMs)
  const day = localDate(at)
  const hour = Math.floor(input.nowMs / HOUR_MS)
  const hourEnds = new Date((hour + 1) * HOUR_MS)
  const key = dailyHashKey(input.secret, day)
  const userAgent = input.headers.get('user-agent')?.trim() ?? ''
  const language = input.headers.get('accept-language')?.trim() ?? ''
  return {
    at,
    dedupe: {
      key: limitKey(key, ['view', bucket, input.postId, userAgent, language]),
      expiresAt: new Date(input.nowMs + VIEW_DEDUPE_SECONDS * 1000),
    },
    counters: [
      {
        key: limitKey(key, ['ip-post-hour', bucket, input.postId, hour]),
        expiresAt: hourEnds,
        max: input.limits.perPostHour,
      },
      {
        key: limitKey(key, ['ip-hour', bucket, hour]),
        expiresAt: hourEnds,
        max: input.limits.perHour,
      },
      {
        key: limitKey(key, ['ip-day', bucket, day]),
        expiresAt: endOfLocalDay(day),
        max: input.limits.perDay,
      },
    ],
  }
}
