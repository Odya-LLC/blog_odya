import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { env } from '@/env'

/**
 * Integratsion test: S3-mos saqlashga (lokal — MinIO) fayl yozish va o'qish.
 * Payload'dagi `@payloadcms/storage-s3` bilan bir xil env ishlatiladi.
 */
const client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
})

const bucket = env.S3_BUCKET
const key = `tests/s3-roundtrip-${Date.now()}.txt`
const body = 'Salom, Blog Odya! Салом, Блог Одя!'

describe('S3 (MinIO) yozish/o‘qish', () => {
  beforeAll(async () => {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }))
    } catch {
      // CI'da init konteyner yo'q — bucket'ni o'zimiz yaratamiz.
      await client.send(new CreateBucketCommand({ Bucket: bucket }))
    }
  })

  afterAll(async () => {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    client.destroy()
  })

  it('fayl yozadi va o‘sha mazmunni qaytarib o‘qiydi', async () => {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'text/plain; charset=utf-8',
      }),
    )

    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    expect(await result.Body?.transformToString('utf-8')).toBe(body)
  })
})
