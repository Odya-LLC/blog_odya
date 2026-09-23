import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3'

import { env } from '@/env'

/** Testlar uchun S3 klient — Payload'dagi `@payloadcms/storage-s3` bilan bir xil env. */
export function createTestS3Client(): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  })
}

/** CI'da init konteyner yo'q — bucket bo'lmasa yaratamiz. */
export async function ensureBucket(client: S3Client): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }))
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }))
  }
}

export async function getObject(client: S3Client, key: string) {
  const result = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
  const body = Buffer.from((await result.Body?.transformToByteArray()) ?? [])
  return { body, contentType: result.ContentType }
}

export async function deleteObject(client: S3Client, key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
}
