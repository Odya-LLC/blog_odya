/**
 * `next/image` custom loader uchun media variantlari (TZ §3.7.2, §8.4, §10.7).
 *
 * Vercel Image Optimization ishlatilmaydi: rasm yuklashda Payload (sharp) tayyorlagan WebP
 * variantlari (`thumb` 320, `card` 640, `hero` 1280, `full` 1920) to'g'ridan-to'g'ri media
 * domenidan (`MEDIA_PUBLIC_URL`, production: https://media.odya.uz) beriladi.
 *
 * Loader faqat `{ src, width }` oladi, shuning uchun variantlar ro'yxati `src` ning fragmentiga
 * (`#odya-img=…`) yoziladi: `encodeMediaSrc` (server, Payload hujjatidan) → `chooseMediaUrl`
 * (loader, kerakli kenglikka eng mos variant). Fragment serverga yuborilmaydi va yakuniy
 * URL'da qolmaydi.
 */

/** Nisbati asl rasm bilan bir xil bo'lgan variantlar (`og` — 1200×630 kesilgan, kirmaydi). */
export const RESPONSIVE_SIZES = ['thumb', 'card', 'hero', 'full'] as const

const MARKER = '#odya-img='

export type MediaVariant = { width: number; url: string }

type SizeLike = { url?: string | null; width?: number | null } | null | undefined

/** Payload `media` hujjatining loader uchun kerakli qismi. */
export type MediaLike = {
  url?: string | null
  width?: number | null
  sizes?: Partial<Record<string, SizeLike>> | null
}

/** Payload hujjatidan variantlar ro'yxati (kenglik bo'yicha o'sish tartibida, takrorlarsiz). */
export function mediaVariants(media: MediaLike): MediaVariant[] {
  const byWidth = new Map<number, string>()
  for (const name of RESPONSIVE_SIZES) {
    const size = media.sizes?.[name]
    if (size?.url && size.width && size.width > 0 && !byWidth.has(size.width)) {
      byWidth.set(size.width, size.url)
    }
  }
  return [...byWidth.entries()]
    .map(([width, url]) => ({ width, url }))
    .sort((a, b) => a.width - b.width)
}

function directoryOf(url: string): string {
  const clean = url.split(/[?#]/)[0] ?? url
  return clean.slice(0, clean.lastIndexOf('/') + 1)
}

/**
 * `next/image` uchun `src`: asl URL + variantlar fragmenti. Variant asl fayl bilan bir papkada
 * bo'lsa, faqat fayl nomi yoziladi (HTML qisqaroq).
 */
export function encodeMediaSrc(media: MediaLike): string | null {
  const base = media.url
  const variants = mediaVariants(media)
  const fallback = base ?? variants.at(-1)?.url
  if (!fallback) return null
  if (variants.length === 0) return fallback
  const dir = directoryOf(fallback)
  const encoded = variants
    .map(({ width, url }) => {
      const ref =
        url.startsWith(dir) && !url.slice(dir.length).includes('/') ? url.slice(dir.length) : url
      return `${width}:${encodeURIComponent(ref)}`
    })
    .join(',')
  return `${fallback}${MARKER}${encoded}`
}

/** `encodeMediaSrc` natijasini qayta o'qish. Fragment bo'lmasa — `variants: []`. */
export function decodeMediaSrc(src: string): { base: string; variants: MediaVariant[] } {
  const index = src.indexOf(MARKER)
  if (index === -1) return { base: src, variants: [] }
  const base = src.slice(0, index)
  const dir = directoryOf(base)
  const variants: MediaVariant[] = []
  for (const part of src.slice(index + MARKER.length).split(',')) {
    const colon = part.indexOf(':')
    const width = Number(part.slice(0, colon))
    if (colon <= 0 || !Number.isFinite(width) || width <= 0) continue
    const ref = decodeURIComponent(part.slice(colon + 1))
    if (!ref) continue
    const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(ref) || ref.startsWith('/')
    variants.push({ width, url: isAbsolute ? ref : `${dir}${ref}` })
  }
  variants.sort((a, b) => a.width - b.width)
  return { base, variants }
}

/**
 * So'ralgan kenglik uchun URL: kengligi ≥ `width` bo'lgan eng kichik variant, bo'lmasa — eng
 * kattasi. Variantlarsiz `src` (styleguide SVG'lari, tashqi rasm) o'zgarishsiz qaytadi.
 */
export function chooseMediaUrl(src: string, width: number): string {
  const { base, variants } = decodeMediaSrc(src)
  if (variants.length === 0) return base
  const match = variants.find((variant) => variant.width >= width) ?? variants.at(-1)!
  return match.url
}
