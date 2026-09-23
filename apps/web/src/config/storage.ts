import type { S3StorageOptions } from '@payloadcms/storage-s3'

import { isAdminOrEditorUser } from '@/access'
import type { Env } from '@/env'

type StorageEnv = Pick<
  Env,
  | 'S3_ENDPOINT'
  | 'S3_BUCKET'
  | 'S3_ACCESS_KEY_ID'
  | 'S3_SECRET_ACCESS_KEY'
  | 'S3_REGION'
  | 'S3_FORCE_PATH_STYLE'
  | 'MEDIA_PUBLIC_URL'
>

/**
 * `@payloadcms/storage-s3` sozlamalari (TZ §3.1, §3.7.1, §10.7).
 *
 * Lokal — MinIO, preview/production — Cloudflare R2: farq faqat env qiymatlarida.
 *
 * - `clientUploads: true` — brauzer faylni imzolangan (presigned) PUT URL orqali to'g'ridan-to'g'ri
 *   bucket'ga yuklaydi (Vercel so'rov tanasi 4.5 MB bilan cheklangan). Bucket'da sayt domeni uchun
 *   CORS (PUT) ruxsat etilishi kerak — `docs/runbooks/r2-cors.md`.
 * - `MEDIA_PUBLIC_URL` berilsa, fayl URL'lari to'g'ridan-to'g'ri ommaviy domenga
 *   (production: `https://media.odya.uz`) ishora qiladi, Payload orqali proksilanmaydi.
 */
export function getS3StorageOptions(env: StorageEnv): S3StorageOptions {
  const mediaPublicUrl = env.MEDIA_PUBLIC_URL?.replace(/\/+$/, '')

  return {
    enabled: Boolean(env.S3_BUCKET),
    clientUploads: {
      // Imzolangan URL faqat admin/editor uchun beriladi.
      access: ({ req }) => isAdminOrEditorUser(req.user),
    },
    collections: {
      media: mediaPublicUrl
        ? {
            disablePayloadAccessControl: true,
            generateFileURL: ({ filename, prefix }) =>
              [mediaPublicUrl, prefix, filename].filter(Boolean).join('/'),
          }
        : true,
    },
    bucket: env.S3_BUCKET ?? '',
    config: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      // AWS SDK v3 (>= 3.729) default'da CRC32 checksum qo'shadi; presigned PUT'da bu brauzer
      // yubormaydigan checksum'ni imzoga kiritadi va R2/MinIO yuklashni rad etadi.
      // Faqat operatsiya talab qilganda hisoblanadi.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
      },
    },
  }
}
