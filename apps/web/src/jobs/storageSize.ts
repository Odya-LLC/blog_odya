import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

import type { Env } from '@/env'
import { ARCHIVE_TIMEOUT_MS } from '@/scraping/archive'

import type { R2SizeStats } from './stats'

/**
 * R2 (S3-mos) hajmini o'lchash (`maintenance.cleanup`, TZ §3.7.2: R2 ≥ 8 GB → ogohlantirish).
 *
 * Usul: `ListObjectsV2` (sahifa — 1000 obyekt) bilan `Size` lar yig'indisi, media va arxiv
 * (`S3_BUCKET`, `S3_RAW_BUCKET`) bucket'lari. Arzonroq yo'l — Cloudflare GraphQL Analytics
 * (`r2StorageAdaptiveGroups`) — alohida API token va account ID talab qiladi; hozircha kerak emas:
 * hajm hisobi (TZ §3.7.2) bo'yicha yiliga ~40 ming obyekt → ~40 so'rov (Class A kvotasi oyiga
 * 1 mln), bir necha soniya. Vaqt byudjeti (`R2_LIST_BUDGET_MS`) tugasa, o'lchov to'xtaydi va
 * `complete: false` bilan pastki chegara yoziladi (ogohlantirish uchun baribir yaroqli).
 */

export interface ListPage {
  bytes: number
  objects: number
  nextToken?: string
}

export interface BucketLister {
  listPage(bucket: string, continuationToken?: string): Promise<ListPage>
}

export async function measureBuckets(
  lister: BucketLister,
  buckets: readonly string[],
  options: { deadlineAt: number; now?: () => number },
): Promise<R2SizeStats> {
  const now = options.now ?? Date.now
  const result: R2SizeStats = {
    bytes: 0,
    objects: 0,
    complete: true,
    buckets: [],
    measuredAt: new Date(now()).toISOString(),
  }
  for (const name of new Set(buckets)) {
    const bucket = { name, bytes: 0, objects: 0, complete: false }
    result.buckets.push(bucket)
    let token: string | undefined
    while (now() < options.deadlineAt) {
      const page = await lister.listPage(name, token)
      bucket.bytes += page.bytes
      bucket.objects += page.objects
      token = page.nextToken
      if (!token) {
        bucket.complete = true
        break
      }
    }
    result.bytes += bucket.bytes
    result.objects += bucket.objects
    if (!bucket.complete) result.complete = false
  }
  return result
}

type StorageEnv = Pick<
  Env,
  | 'S3_ENDPOINT'
  | 'S3_BUCKET'
  | 'S3_RAW_BUCKET'
  | 'S3_ACCESS_KEY_ID'
  | 'S3_SECRET_ACCESS_KEY'
  | 'S3_REGION'
  | 'S3_FORCE_PATH_STYLE'
>

export function storageBuckets(env: StorageEnv): string[] {
  return [env.S3_BUCKET, env.S3_RAW_BUCKET].filter((b): b is string => Boolean(b))
}

export function createS3BucketLister(env: StorageEnv): BucketLister | null {
  if (!env.S3_ENDPOINT) return null
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? 'auto',
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
    },
  })
  return {
    async listPage(bucket, continuationToken) {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        }),
        { abortSignal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS) },
      )
      const contents = page.Contents ?? []
      return {
        bytes: contents.reduce((sum, object) => sum + (object.Size ?? 0), 0),
        objects: contents.length,
        nextToken: page.IsTruncated ? page.NextContinuationToken : undefined,
      }
    },
  }
}
