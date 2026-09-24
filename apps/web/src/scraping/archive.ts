import { promisify } from 'node:util'
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib'

import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

import type { Env } from '@/env'

/**
 * "To'liq manba" arxivi (TZ §3.5, §3.7.2): raw va tozalangan HTML — gzip, **yopiq** bucket'da
 * (`S3_RAW_BUCKET`; production — R2 `blog-odya-raw`, lifecycle 30 kun). DB'ga HTML yozilmaydi —
 * `scraped-items` da faqat kalitlar (`rawHtmlKey`, `cleanHtmlKey`).
 *
 * Kalit sxemasi: `raw/{source}/{yyyy-mm}/{id}.html.gz` va `raw/{source}/{yyyy-mm}/{id}.clean.html.gz`.
 */

const gzip = promisify(gzipCb)
const gunzip = promisify(gunzipCb)

/** S3 operatsiyasi uchun timeout — task byudjetidan (≤ 30 s) chiqmaslik uchun. */
export const ARCHIVE_TIMEOUT_MS = 10_000

export type ArchiveKind = 'raw' | 'clean'

export interface ArchiveStorage {
  /** Obyektni yozadi (tanasi — allaqachon gzip qilingan). */
  put(key: string, body: Buffer, contentType: string): Promise<void>
  /** Obyektni o'qiydi; topilmasa `null`. */
  get(key: string): Promise<Buffer | null>
}

/** `raw/{source}/{yyyy-mm}/{id}.html.gz` / `.clean.html.gz` (oy — UTC, element yaratilgan sana). */
export function archiveKey(
  sourceSlug: string,
  date: Date | string,
  id: number | string,
  kind: ArchiveKind,
): string {
  const d = new Date(date)
  const month = Number.isNaN(d.getTime()) ? new Date() : d
  const yyyyMm = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}`
  const safeSlug = sourceSlug.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'unknown'
  return `raw/${safeSlug}/${yyyyMm}/${id}${kind === 'clean' ? '.clean' : ''}.html.gz`
}

export const GZIP_CONTENT_TYPE = 'application/gzip'

export async function gzipHtml(html: string): Promise<Buffer> {
  return gzip(Buffer.from(html, 'utf8'), { level: 9 })
}

export async function gunzipHtml(body: Buffer): Promise<string> {
  return (await gunzip(body)).toString('utf8')
}

export async function putHtml(storage: ArchiveStorage, key: string, html: string): Promise<number> {
  const body = await gzipHtml(html)
  await storage.put(key, body, GZIP_CONTENT_TYPE)
  return body.length
}

export async function getHtml(storage: ArchiveStorage, key: string): Promise<string | null> {
  const body = await storage.get(key)
  return body ? gunzipHtml(body) : null
}

type ArchiveEnv = Pick<
  Env,
  | 'S3_ENDPOINT'
  | 'S3_RAW_BUCKET'
  | 'S3_ACCESS_KEY_ID'
  | 'S3_SECRET_ACCESS_KEY'
  | 'S3_REGION'
  | 'S3_FORCE_PATH_STYLE'
>

/** S3-mos (R2 / MinIO) arxiv. `S3_RAW_BUCKET` bo'lmasa — `null` (arxiv o'chiq). */
export function createS3ArchiveStorage(env: ArchiveEnv): ArchiveStorage | null {
  const bucket = env.S3_RAW_BUCKET
  if (!bucket || !env.S3_ENDPOINT) return null
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
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
        { abortSignal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS) },
      )
    },
    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
          abortSignal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS),
        })
        return Buffer.from((await result.Body?.transformToByteArray()) ?? [])
      } catch (error) {
        if (error instanceof NoSuchKey) return null
        throw error
      }
    },
  }
}

/** Testlar uchun xotiradagi arxiv. */
export class MemoryArchiveStorage implements ArchiveStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>()

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType })
  }

  async get(key: string): Promise<Buffer | null> {
    return this.objects.get(key)?.body ?? null
  }
}
