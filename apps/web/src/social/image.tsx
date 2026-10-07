/**
 * Ijtimoiy tarmoqlar uchun JPEG rasm (OBLOG-91): Instagram API faqat **JPEG** qabul qiladi
 * (bizning media variantlari — WebP), nisbat 4:5 … 1.91:1.
 *
 * - Muqova bor — asl rasm (yoki `full` 1920 WebP) yuklab olinadi va `sharp` bilan focal point
 *   bo'yicha kesiladi (`cover`), JPEG (sifat 85, progressive, mozjpeg).
 * - Muqova yo'q yoki yuklab bo'lmadi — avtomatik brend kartochkasi (`OgCard`, `next/og`) shu
 *   o'lchamda, PNG → JPEG.
 */
import type { Locale } from '@blog-odya/shared/locales'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'

import { loadOgFonts, OgCard } from '@/site/seo/og'

import { SOCIAL_IMAGE_SIZES, type SocialImageVariant } from './make/payload'

export const SOCIAL_JPEG_QUALITY = 85
/** Muqova manbasini yuklab olish chegarasi. */
export const SOCIAL_SOURCE_TIMEOUT_MS = 10_000
export const SOCIAL_SOURCE_MAX_BYTES = 25 * 1024 * 1024

export interface SocialImageCover {
  url: string
  /** Payload focal point, foizda (0–100). */
  focalX?: number | null
  focalY?: number | null
}

export interface SocialImageInput {
  variant: SocialImageVariant
  locale: Locale
  title: string
  category?: { name: string; slug?: string | null; color?: string | null } | null
  cover?: SocialImageCover | null
}

export interface SocialImageDeps {
  fetch: typeof fetch
}

export const socialImageDeps: SocialImageDeps = { fetch: (...args) => fetch(...args) }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** Rasmni `width×height` ga focal point atrofida kesadi (kichik bo'lsa — kattalashtiradi). */
export async function cropToJpeg(
  source: Buffer,
  target: { width: number; height: number },
  focal: { x?: number | null; y?: number | null } = {},
): Promise<Buffer> {
  const image = sharp(source, { failOn: 'error' }).rotate()
  const meta = await image.metadata()
  // `rotate()` EXIF bo'yicha buradi — 90/270 da eni va bo'yi almashadi.
  const swap = (meta.orientation ?? 1) >= 5
  const srcW = (swap ? meta.height : meta.width) ?? 0
  const srcH = (swap ? meta.width : meta.height) ?? 0
  if (!srcW || !srcH) throw new Error('rasm o‘lchami aniqlanmadi')
  const scale = Math.max(target.width / srcW, target.height / srcH)
  const width = Math.max(target.width, Math.round(srcW * scale))
  const height = Math.max(target.height, Math.round(srcH * scale))
  const fx = clamp((focal.x ?? 50) / 100, 0, 1)
  const fy = clamp((focal.y ?? 50) / 100, 0, 1)
  const left = clamp(Math.round(width * fx - target.width / 2), 0, width - target.width)
  const top = clamp(Math.round(height * fy - target.height / 2), 0, height - target.height)
  return image
    .resize(width, height, { fit: 'fill' })
    .extract({ left, top, width: target.width, height: target.height })
    .flatten({ background: '#0B0B0F' })
    .jpeg({ quality: SOCIAL_JPEG_QUALITY, progressive: true, mozjpeg: true })
    .toBuffer()
}

async function fetchSource(url: string, deps: SocialImageDeps): Promise<Buffer> {
  const response = await deps.fetch(url, { signal: AbortSignal.timeout(SOCIAL_SOURCE_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`muqova yuklanmadi: HTTP ${response.status}`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > SOCIAL_SOURCE_MAX_BYTES) throw new Error('muqova juda katta')
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > SOCIAL_SOURCE_MAX_BYTES) throw new Error('muqova juda katta')
  return buffer
}

/** Muqovasiz post uchun brend kartochkasi (JPEG). */
export async function renderCardJpeg(input: SocialImageInput): Promise<Buffer> {
  const size = SOCIAL_IMAGE_SIZES[input.variant]
  const response = new ImageResponse(
    <OgCard locale={input.locale} title={input.title} category={input.category} size={size} />,
    { ...size, fonts: await loadOgFonts() },
  )
  const png = Buffer.from(await response.arrayBuffer())
  return sharp(png)
    .flatten({ background: '#0B0B0F' })
    .jpeg({ quality: SOCIAL_JPEG_QUALITY, progressive: true, mozjpeg: true })
    .toBuffer()
}

/**
 * Variant JPEG'i. Muqova xatosi (404, buzilgan fayl) — kartochkaga qaytadi; `source` — qaysi
 * yo'l ishlatilgani (log/sarlavha uchun).
 */
export async function renderSocialImage(
  input: SocialImageInput,
  deps: SocialImageDeps = socialImageDeps,
  onCoverError?: (error: unknown) => void,
): Promise<{ body: Buffer; source: 'cover' | 'card' }> {
  if (input.cover?.url) {
    try {
      const source = await fetchSource(input.cover.url, deps)
      const body = await cropToJpeg(source, SOCIAL_IMAGE_SIZES[input.variant], {
        x: input.cover.focalX,
        y: input.cover.focalY,
      })
      return { body, source: 'cover' }
    } catch (error) {
      onCoverError?.(error)
    }
  }
  return { body: await renderCardJpeg(input), source: 'card' }
}
