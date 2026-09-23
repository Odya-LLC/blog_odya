import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Media } from './collections/Media'
import { Users } from './collections/Users'
import { env } from './env'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Migratsiyalar (`pnpm migrate`, `pnpm migrate:create`) direct ulanish orqali ishlaydi
 * (Supabase: session/direct, pooler emas). Skriptlar `PAYLOAD_MIGRATING=true` o'rnatadi.
 */
const isMigrating = process.env.PAYLOAD_MIGRATING === 'true'
const connectionString =
  (isMigrating ? env.DATABASE_URL_DIRECT : undefined) ?? env.DATABASE_URL ?? ''

const mediaPublicUrl = env.MEDIA_PUBLIC_URL?.replace(/\/+$/, '')

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media],
  editor: lexicalEditor(),
  secret: env.PAYLOAD_SECRET ?? '',
  serverURL: env.NEXT_PUBLIC_SITE_URL,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString,
    },
    // Sxema faqat migratsiyalar orqali o'zgaradi (dev'da ham `push` o'chiq),
    // shunda lokal, CI va production bir xil yo'ldan yuradi.
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  sharp,
  plugins: [
    // Lokal: MinIO, production: Cloudflare R2 — farq faqat env'da (TZ §3.1, §3.7).
    s3Storage({
      enabled: Boolean(env.S3_BUCKET),
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
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
          secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
        },
      },
    }),
  ],
})
