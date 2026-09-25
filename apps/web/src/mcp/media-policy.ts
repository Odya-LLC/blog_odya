import { isIP } from 'node:net'

import { MEDIA_LICENSES } from '@/collections/Media'

import { charLength, findCyrillic, hasWrongOkina, type Issue } from './validation'

/**
 * MCP orqali rasm yuklash qoidalari (OBLOG-44, `copyright.md` §4 «Rasmlar siyosati»):
 * litsenziya, taqiqlangan domenlar (scraped manbalar va agentliklar), alt matni, format va
 * o'lcham, SSRF uchun IP manzillar tekshiruvi. Sof funksiyalar — tarmoq/DB yo'q (testlanadi).
 */

export type MediaLicense = (typeof MEDIA_LICENSES)[number]['value']

export const MEDIA_LICENSE_VALUES = MEDIA_LICENSES.map((license) => license.value) as [
  MediaLicense,
  ...MediaLicense[],
]

/** Maksimal fayl hajmi (URL va base64 uchun bir xil). */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024
/** O'lcham chegaralari (piksel). */
export const MEDIA_MIN_WIDTH = 400
export const MEDIA_MIN_HEIGHT = 200
export const MEDIA_MAX_SIDE = 10_000
export const MEDIA_MAX_PIXELS = 50_000_000

export const MEDIA_ALT_WORDS = { min: 5, max: 15 } as const

/** Ruxsat etilgan formatlar (SVG, GIF va boshqalar — yo'q). */
export const MEDIA_FORMATS = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  png: { mime: 'image/png', ext: 'png' },
  webp: { mime: 'image/webp', ext: 'webp' },
} as const

export type MediaFormat = keyof typeof MEDIA_FORMATS

/** Kredit majburiy litsenziyalar (`copyright.md` §4 jadvali). */
const CREDIT_REQUIRED: readonly MediaLicense[] = [
  'press_kit',
  'unsplash',
  'pexels',
  'cc_by',
  'other',
]

/** `ai_generated` uchun standart kredit (`copyright.md` §4). */
export const AI_GENERATED_CREDIT = 'Rasm: AI yordamida yaratilgan'

/**
 * Agentliklar, foto-banklar va scraped manbalarning rasm CDN'lari — rasmlari litsenziyasiz
 * ishlatilmaydi (`copyright.md` §4). Subdomenlari ham (`*.gettyimages.com`). `sources`
 * kolleksiyasidagi manbalar domenlari bunga qo'shimcha ravishda runtime'da qo'shiladi.
 */
export const STATIC_BLOCKED_IMAGE_DOMAINS = [
  // Scraped manbalar CDN'lari
  'habr.com',
  'habrastorage.org',
  'hsto.org',
  // Agentliklar
  'reuters.com',
  'reutersmedia.net',
  'reutersconnect.com',
  'apnews.com',
  'ap.org',
  'apimages.com',
  'afp.com',
  'afpforum.com',
  'epa.eu',
  'epaimages.com',
  'tass.ru',
  'tass.com',
  'ria.ru',
  'sputniknews.com',
  'xinhuanet.com',
  'dpa.com',
  'picture-alliance.com',
  'bloomberg.com',
  'bwbx.io',
  // Foto-banklar (pullik litsenziya)
  'gettyimages.com',
  'gettyimages.co.uk',
  'gettyimages.ru',
  'gettyimages.ae',
  'gettyimages.ca',
  'gettyimages.com.au',
  'gettyimages.de',
  'gettyimages.fr',
  'gettyimages.in',
  'istockphoto.com',
  'shutterstock.com',
  'alamy.com',
  'depositphotos.com',
  'dreamstime.com',
  'adobestock.com',
  'stock.adobe.com',
  'ftcdn.net',
  '123rf.com',
  'bigstockphoto.com',
  'lori.ru',
] as const

/** Ikkinchi darajali umumiy zonalar (`co.uk`, `com.uz` …) — asosiy domenni aniqlash uchun. */
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'go'])

export function normalizeHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
}

/**
 * Taxminiy "ro'yxatdan o'tgan" domen: `feeds.bbci.co.uk` → `bbci.co.uk`, `www.kun.uz` → `kun.uz`.
 * IP manzil — o'zgarmaydi. (Public Suffix List'siz — manba domenlari uchun yetarli.)
 */
export function baseDomain(host: string): string {
  const clean = normalizeHost(host)
  if (isIP(clean)) return clean
  const labels = clean.split('.').filter(Boolean)
  if (labels.length <= 2) return labels.join('.')
  const secondLevel = labels[labels.length - 2]!
  const take = SECOND_LEVEL.has(secondLevel) && labels[labels.length - 1]!.length === 2 ? 3 : 2
  return labels.slice(-take).join('.')
}

/** Host domen yoki uning subdomeni. */
export function hostMatches(host: string, domain: string): boolean {
  const h = normalizeHost(host)
  const d = normalizeHost(domain)
  return h === d || h.endsWith(`.${d}`)
}

/** Birinchi mos keluvchi taqiqlangan domen (yoki `null`). */
export function blockedDomainOf(host: string, blocked: Iterable<string>): string | null {
  for (const domain of blocked) if (hostMatches(host, domain)) return domain
  return null
}

// ---------------------------------------------------------------------------
// Litsenziya va matn maydonlari
// ---------------------------------------------------------------------------

export interface MediaMetaInput {
  alt: string
  caption?: string | undefined
  credit?: string | undefined
  license: MediaLicense
  licenseUrl?: string | undefined
  licenseNote?: string | undefined
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function latinCheck(errors: Issue[], warnings: Issue[], field: string, text: string | undefined) {
  if (!text) return
  const cyrillic = findCyrillic(text)
  if (cyrillic.length) {
    errors.push({
      field,
      code: 'cyrillic_in_latin',
      message:
        `${field} lotin yozuvida bo'lishi kerak — kirill harflari topildi: ${cyrillic.join(', ')}. ` +
        'Kirill versiyasi avtomatik yaratiladi.',
    })
  }
  if (hasWrongOkina(text)) {
    warnings.push({
      field,
      code: 'wrong_apostrophe',
      message: `${field}: oʻ/gʻ uchun ʻ (U+02BB) ishlatilsin (o' / g' emas).`,
    })
  }
}

export function altWordCount(alt: string): number {
  return alt.split(/\s+/).filter(Boolean).length
}

/** Alt matni: lotin, 5–15 so'z, ≤ 200 belgi, «rasm/surat» bilan boshlanmaydi. */
export function checkMediaAlt(alt: string, field = 'alt'): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = []
  const warnings: Issue[] = []
  const text = alt.trim()
  if (!text) {
    errors.push({ field, code: 'required', message: `${field} majburiy (5–15 so'z, lotin).` })
    return { errors, warnings }
  }
  latinCheck(errors, warnings, field, text)
  if (charLength(text) > 200) {
    errors.push({ field, code: 'too_long', message: `${field} 200 belgidan oshmasligi kerak.` })
  }
  const words = altWordCount(text)
  if (words < MEDIA_ALT_WORDS.min || words > MEDIA_ALT_WORDS.max) {
    errors.push({
      field,
      code: 'alt_words',
      message: `${field} — ${MEDIA_ALT_WORDS.min}–${MEDIA_ALT_WORDS.max} so'z (hozir ${words}).`,
    })
  }
  if (/^(rasm|surat|image|photo)\b/i.test(text)) {
    warnings.push({
      field,
      code: 'starts_with_image',
      message: "«Rasm», «surat» so'zlari bilan boshlanmaydi — nima tasvirlanganini yozing.",
    })
  }
  return { errors, warnings }
}

/**
 * Litsenziya qoidalari (`copyright.md` §4): `cc_by` — `licenseUrl` majburiy; `other` — izoh
 * (`licenseNote`, yozma ruxsat) majburiy; press-kit/Unsplash/Pexels/CC BY/boshqa — kredit majburiy.
 */
export function checkMediaLicense(input: {
  license?: string | null | undefined
  licenseUrl?: string | null | undefined
  licenseNote?: string | null | undefined
  credit?: string | null | undefined
}): Issue[] {
  const errors: Issue[] = []
  const license = input.license
  if (!license || !(MEDIA_LICENSE_VALUES as readonly string[]).includes(license)) {
    errors.push({
      field: 'license',
      code: 'license_required',
      message: `license majburiy: ${MEDIA_LICENSE_VALUES.join(', ')}.`,
    })
    return errors
  }
  const licenseUrl = input.licenseUrl?.trim()
  if (licenseUrl && !isHttpUrl(licenseUrl)) {
    errors.push({
      field: 'licenseUrl',
      code: 'invalid_url',
      message: 'licenseUrl — http(s):// havola bo‘lishi kerak.',
    })
  }
  if (license === 'cc_by' && !licenseUrl) {
    errors.push({
      field: 'licenseUrl',
      code: 'license_url_required',
      message:
        'cc_by uchun licenseUrl majburiy (masalan, https://creativecommons.org/licenses/by/4.0/).',
    })
  }
  if (license === 'other' && !input.licenseNote?.trim()) {
    errors.push({
      field: 'licenseNote',
      code: 'license_note_required',
      message:
        'license: other uchun licenseNote majburiy — yozma ruxsat kimdan va qanday olinganini yozing.',
    })
  }
  if (CREDIT_REQUIRED.includes(license as MediaLicense) && !input.credit?.trim()) {
    errors.push({
      field: 'credit',
      code: 'credit_required',
      message: `license: ${license} uchun credit majburiy (masalan, «Rasm: Muallif ismi / Unsplash»).`,
    })
  }
  return errors
}

/** `upload_media` metama'lumotlari: alt, caption, credit (lotin) va litsenziya. */
export function checkMediaMeta(input: MediaMetaInput): { errors: Issue[]; warnings: Issue[] } {
  const alt = checkMediaAlt(input.alt)
  const errors = [...alt.errors, ...checkMediaLicense(input)]
  const warnings = [...alt.warnings]
  latinCheck(errors, warnings, 'caption', input.caption?.trim())
  latinCheck(errors, warnings, 'credit', input.credit?.trim())
  return { errors, warnings }
}

// ---------------------------------------------------------------------------
// Format va o'lcham
// ---------------------------------------------------------------------------

/** Fayl formati — sarlavha baytlari (magic bytes) bo'yicha; kengaytma/Content-Type ga ishonilmaydi. */
export function sniffImageFormat(data: Uint8Array): MediaFormat | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg'
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return 'png'
  }
  if (
    data.length >= 12 &&
    String.fromCharCode(...data.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...data.subarray(8, 12)) === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

/** O'lcham tekshiruvi (sharp metadata natijasi). */
export function checkDimensions(width: number, height: number): string | null {
  if (!width || !height) return "Rasm o'lchamini aniqlab bo'lmadi — fayl buzilgan bo'lishi mumkin."
  if (width < MEDIA_MIN_WIDTH || height < MEDIA_MIN_HEIGHT) {
    return `Rasm juda kichik: ${width}×${height} (kamida ${MEDIA_MIN_WIDTH}×${MEDIA_MIN_HEIGHT}; muqova uchun ≥ 1200 px kenglik tavsiya etiladi).`
  }
  if (width > MEDIA_MAX_SIDE || height > MEDIA_MAX_SIDE || width * height > MEDIA_MAX_PIXELS) {
    return `Rasm juda katta: ${width}×${height} (ko'pi bilan ${MEDIA_MAX_SIDE} px tomon, ${MEDIA_MAX_PIXELS / 1_000_000} MP).`
  }
  return null
}

/** Xavfsiz fayl nomi: lotin harflari, raqamlar va `-`; kengaytma — haqiqiy formatdan. */
export function safeFilename(name: string | undefined, format: MediaFormat): string {
  const base = (name ?? '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${base || 'rasm'}.${MEDIA_FORMATS[format].ext}`
}

// ---------------------------------------------------------------------------
// SSRF: IP manzillar
// ---------------------------------------------------------------------------

type Cidr4 = readonly [number, number]

/** Ommaviy bo'lmagan IPv4 diapazonlari (RFC 6890 va boshqalar). */
const BLOCKED_V4: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
}

const BLOCKED_V4_INT: readonly Cidr4[] = BLOCKED_V4.map(([base, bits]) => [v4ToInt(base), bits])

function v4Blocked(ip: string): boolean {
  const value = v4ToInt(ip)
  return BLOCKED_V4_INT.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return (value & mask) >>> 0 === (base & mask) >>> 0
  })
}

/** IPv6 → 8 ta 16-bitli guruh (IPv4 qo'shimchasi bilan ham). */
function v6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().split('%')[0]!
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)
  if (v4) {
    const n = v4ToInt(v4[1]!)
    text = text.slice(0, -v4[1]!.length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }
  const [head, tail] = text.split('::') as [string, string | undefined]
  const parse = (part: string) => (part ? part.split(':').map((g) => parseInt(g, 16)) : [])
  const left = parse(head)
  const right = tail === undefined ? [] : parse(tail)
  const fill = tail === undefined ? 0 : 8 - left.length - right.length
  if (fill < 0) return null
  const groups = [...left, ...Array<number>(fill).fill(0), ...right]
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) return null
  return groups
}

/**
 * Manzil ommaviy (internetdagi) emasmi: loopback, xususiy tarmoqlar, link-local (bulut
 * metadata — 169.254.169.254, fd00:ec2::254), CGNAT, multicast, hujjatlashtirish diapazonlari,
 * IPv4-mapped/NAT64/6to4/Teredo (ichidagi IPv4 bilan) — hammasi taqiqlangan.
 */
export function isBlockedAddress(address: string): boolean {
  const ip = normalizeHost(address)
  const family = isIP(ip)
  if (family === 4) return v4Blocked(ip)
  if (family !== 6) return true
  const g = v6Groups(ip)
  if (!g) return true
  const embeddedV4 = (hi: number, lo: number) =>
    v4Blocked(`${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`)
  // ::/128, ::1/128 va IPv4-compatible (::a.b.c.d)
  if (g.slice(0, 6).every((x) => x === 0)) return true
  // ::ffff:a.b.c.d (IPv4-mapped)
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return embeddedV4(g[6]!, g[7]!)
  // 64:ff9b::/96 (NAT64)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return embeddedV4(g[6]!, g[7]!)
  }
  const first = g[0]!
  // Faqat global unicast (2000::/3)
  if ((first & 0xe000) !== 0x2000) return true
  // 2001::/32 Teredo, 2001:db8::/32 hujjatlar, 2002::/16 6to4, 2001:10::/28 ORCHID
  if (first === 0x2001 && (g[1] === 0 || g[1] === 0xdb8 || (g[1]! & 0xfff0) === 0x10)) return true
  if (first === 0x2002) return true
  return false
}
