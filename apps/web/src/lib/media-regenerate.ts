/**
 * Mavjud rasmlar uchun yangi variantlarni yaratish (OBLOG-57: `news16x9`, `news4x3`, `news1x1`).
 *
 * Payload variantlarni faqat yuklashda yaratadi. Bu modul **faqat yetishmayotgan** `news*`
 * variantlarni asl fayldan (S3/R2) yasab, bucket'ga yozadi va `media.sizes` ga qo'shadi:
 * - asl fayl va mavjud variantlar (URL'lar, Telegram/Google indeksidagi rasmlar) o'zgarmaydi;
 * - kesish — Payload bilan bir xil algoritm (focal point, `createImageSizes`), fayl nomi —
 *   `{nom}-{kenglik}x{balandlik}.webp`;
 * - asl rasm har ikki o'lchamda variantdan kichik bo'lsa — yaratilmaydi (Payload ham shunday);
 * - idempotent: variant bor bo'lsa — tegilmaydi; qayta ishga tushirish xavfsiz;
 * - partiyalar (`batchSize`) bo'yicha, `id` tartibida; bitta rasm xatosi — log, keyingisiga o'tiladi.
 *
 * CLI: `pnpm --filter @blog-odya/web media:regenerate [--dry-run] [--limit=N] [--batch=N]`
 * (`src/scripts/regenerate-media-sizes.ts`), prod — `gh workflow run media-regenerate`.
 */
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { Payload } from 'payload'
import sharp, { type Sharp } from 'sharp'

import type { Env } from '@/env'
import type { Media } from '@/payload-types'

import { NEWS_IMAGE_SIZES } from './media-image'

type SizeConfig = { name: string; width: number; height: number }

export interface MediaStorage {
  get(key: string): Promise<Buffer>
  put(key: string, body: Buffer, contentType: string): Promise<void>
}

type StorageEnv = Pick<
  Env,
  | 'S3_ENDPOINT'
  | 'S3_BUCKET'
  | 'S3_ACCESS_KEY_ID'
  | 'S3_SECRET_ACCESS_KEY'
  | 'S3_REGION'
  | 'S3_FORCE_PATH_STYLE'
>

const S3_TIMEOUT_MS = 60_000

/** Media bucket (`S3_BUCKET`, lokal — MinIO, prod — R2 `media`). */
export function createS3MediaStorage(env: StorageEnv): MediaStorage {
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? 'auto',
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
    },
  })
  const bucket = env.S3_BUCKET
  return {
    async get(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(S3_TIMEOUT_MS),
      })
      return Buffer.from((await result.Body?.transformToByteArray()) ?? [])
    },
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
        { abortSignal: AbortSignal.timeout(S3_TIMEOUT_MS) },
      )
    },
  }
}

/** Obyekt kaliti: `prefix` / `_objectKey` papkasi (storage plagini) + fayl nomi. */
export function mediaObjectKey(
  doc: { prefix?: string | null; _objectKey?: string | null },
  filename: string,
): string {
  return [doc.prefix, doc._objectKey, filename]
    .map((part) => part?.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
}

/** Storage plagini bilan bir xil URL (`config/storage.ts` → `generateFileURL`). */
export function mediaFileUrl(
  doc: { prefix?: string | null; _objectKey?: string | null },
  filename: string,
  publicUrl?: string | null,
): string {
  const base = publicUrl?.replace(/\/+$/, '')
  if (base) return `${base}/${mediaObjectKey(doc, filename)}`
  return `/api/media/file/${encodeURIComponent(filename)}`
}

/** Payload `generateImageSizeFilename`: `{asl nom kengaytmasiz}-{w}x{h}.{ext}`. */
export function sizeFilename(filename: string, width: number, height: number, ext = 'webp') {
  const dot = filename.lastIndexOf('.')
  const name = dot > 0 ? filename.slice(0, dot) : filename
  return `${name}-${width}x${height}.${ext}`
}

/** Payload `getImageResizeAction` (withoutEnlargement: undefined): ikkala o'lchamda kichik — yo'q. */
export function shouldCreateSize(
  original: { width?: number | null; height?: number | null },
  size: SizeConfig,
): boolean {
  if (!original.width || !original.height) return false
  return !(original.width < size.width && original.height < size.height)
}

/** Sharp bilan qayta ishlanadigan rasmlar (SVG/GIF/animatsiya emas). */
export function isRegenerable(mimeType: string | null | undefined): boolean {
  return /^image\/(jpe?g|png|webp|avif|tiff)$/i.test(mimeType ?? '')
}

export type RenderedSize = { data: Buffer; width: number; height: number; filesize: number }

/**
 * Bitta kesilgan variant — Payload `createImageSizes` bilan bir xil: EXIF bo'yicha burish;
 * focal point bo'lsa — nisbat bo'yicha masshtab va focal markaz atrofida `extract`, bo'lmasa —
 * `cover` (markaz). WebP, sifat 80 (`collections/Media.ts`).
 */
export async function renderCroppedSize(
  input: Buffer,
  size: SizeConfig,
  focal: { x?: number | null; y?: number | null } | null,
): Promise<RenderedSize> {
  const base = sharp(input).rotate()
  const meta = await base.metadata()
  const rotated = [5, 6, 7, 8].includes(meta.orientation ?? 0)
  const origWidth = (rotated ? meta.height : meta.width) ?? size.width
  const origHeight = (rotated ? meta.width : meta.height) ?? size.height
  let pipeline: Sharp
  const hasFocal = focal && typeof focal.x === 'number' && typeof focal.y === 'number'
  const sameRatio = origWidth / origHeight === size.width / size.height
  if (hasFocal && !sameRatio) {
    const prioritizeHeight = size.width / size.height < origWidth / origHeight
    const scaled = await base
      .clone()
      .resize({
        fastShrinkOnLoad: false,
        height: prioritizeHeight ? size.height : undefined,
        width: prioritizeHeight ? undefined : size.width,
      })
      .toBuffer({ resolveWithObject: true })
    const { width: scaledWidth, height: scaledHeight } = scaled.info
    let left = scaledWidth * (focal.x! / 100) - size.width / 2
    if (left + size.width > scaledWidth) left = scaledWidth - size.width
    if (left < 0) left = 0
    let top = scaledHeight * (focal.y! / 100) - size.height / 2
    if (top + size.height > scaledHeight) top = scaledHeight - size.height
    if (top < 0) top = 0
    pipeline = sharp(scaled.data).extract({
      left: Math.floor(left),
      top: Math.floor(top),
      width: size.width,
      height: size.height,
    })
  } else {
    pipeline = base.clone().resize({ width: size.width, height: size.height })
  }
  const { data, info } = await pipeline.webp({ quality: 80 }).toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, filesize: info.size }
}

export interface RegenerateOptions {
  storage: MediaStorage
  /** Faqat hisoblash — fayl yozilmaydi, DB o'zgarmaydi. */
  dryRun?: boolean
  batchSize?: number
  /** Ko'pi bilan shuncha rasm qayta ishlanadi (sinov uchun). */
  limit?: number
  /** Faqat shu `media` ID'lari (testlar, bitta rasmni tuzatish). */
  ids?: number[]
  /** `MEDIA_PUBLIC_URL` — variant URL'i shu domendan (bo'lmasa — `/api/media/file/…`). */
  publicUrl?: string | null
  log?: (message: string) => void
}

export interface RegenerateSummary {
  scanned: number
  /** Variant(lar) yaratilgan (yoki `dryRun` da — yaratiladigan) rasmlar. */
  updated: number
  /** Yaratilgan variantlar soni. */
  sizesCreated: number
  /** Hamma variant bor yoki rasm kichik / qayta ishlanmaydigan tur. */
  skipped: number
  failed: number
}

type MediaDoc = Media & { prefix?: string | null; _objectKey?: string | null }

/** Rasmda yetishmayotgan (va yaratish mumkin bo'lgan) `news*` variantlari. */
export function missingNewsSizes(doc: MediaDoc): SizeConfig[] {
  if (!isRegenerable(doc.mimeType) || !doc.filename) return []
  return NEWS_IMAGE_SIZES.filter(
    (size) => !doc.sizes?.[size.name]?.filename && shouldCreateSize(doc, size),
  )
}

export async function regenerateNewsSizes(
  payload: Payload,
  options: RegenerateOptions,
): Promise<RegenerateSummary> {
  const log = options.log ?? ((message: string) => payload.logger.info(message))
  const batchSize = Math.max(1, options.batchSize ?? 20)
  const summary: RegenerateSummary = {
    scanned: 0,
    updated: 0,
    sizesCreated: 0,
    skipped: 0,
    failed: 0,
  }
  let lastId = 0
  for (;;) {
    if (options.limit !== undefined && summary.scanned >= options.limit) break
    const { docs } = await payload.find({
      collection: 'media',
      where: {
        and: [
          { id: { greater_than: lastId } },
          ...(options.ids ? [{ id: { in: options.ids } }] : []),
        ],
      },
      sort: 'id',
      limit: batchSize,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    if (docs.length === 0) break
    for (const raw of docs as MediaDoc[]) {
      lastId = raw.id
      if (options.limit !== undefined && summary.scanned >= options.limit) break
      summary.scanned++
      const missing = missingNewsSizes(raw)
      if (missing.length === 0) {
        summary.skipped++
        continue
      }
      const label = `media #${raw.id} (${raw.filename})`
      if (options.dryRun) {
        summary.updated++
        summary.sizesCreated += missing.length
        log(`[dry-run] ${label}: ${missing.map((size) => size.name).join(', ')}`)
        continue
      }
      try {
        const original = await options.storage.get(mediaObjectKey(raw, raw.filename!))
        const sizes: Record<string, unknown> = {}
        for (const size of missing) {
          const rendered = await renderCroppedSize(original, size, {
            x: raw.focalX,
            y: raw.focalY,
          })
          const filename = sizeFilename(raw.filename!, rendered.width, rendered.height)
          await options.storage.put(mediaObjectKey(raw, filename), rendered.data, 'image/webp')
          sizes[size.name] = {
            url: mediaFileUrl(raw, filename, options.publicUrl),
            filename,
            width: rendered.width,
            height: rendered.height,
            mimeType: 'image/webp',
            filesize: rendered.filesize,
          }
        }
        // Payload `update` tashqaridan `sizes` ni qabul qilmaydi (`sanitizeUploadData`) — faqat
        // shu ustunlar DB adapteri orqali yoziladi (hook'larsiz, yangi versiyasiz). Asl fayl va
        // mavjud variantlar o'zgarmaydi.
        await payload.db.updateOne({
          collection: 'media',
          id: raw.id,
          data: { sizes: { ...(raw.sizes ?? {}), ...sizes } },
          returning: false,
        })
        summary.updated++
        summary.sizesCreated += missing.length
        log(`${label}: + ${missing.map((size) => size.name).join(', ')}`)
      } catch (error) {
        summary.failed++
        payload.logger.error({ err: error, msg: `${label}: variantlarni yaratib bo'lmadi` })
      }
    }
  }
  return summary
}
