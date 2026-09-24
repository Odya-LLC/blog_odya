import { DEFAULT_LOCALE, LOCALES, type Locale } from '@blog-odya/shared'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'path'
import { buildConfig, type Config } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Glossary } from './collections/Glossary'
import { Media } from './collections/Media'
import { TranslitExceptions } from './collections/TranslitExceptions'
import { Users } from './collections/Users'
import { getDatabaseMode, getDatabasePoolConfig } from './config/database'
import { getS3StorageOptions } from './config/storage'
import { env } from './env'
import { ADMIN_LANGUAGE, uz } from './i18n/uz'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const LOCALE_LABELS: Record<Locale, string> = {
  'uz-Latn': 'Lotin',
  'uz-Cyrl': 'Кирилл',
}

/**
 * Admin panel faqat o'zbekcha. `uz` Payload'ning `AcceptedLanguages` turida yo'q, lekin runtime
 * kalitlarni `supportedLanguages` dan oladi — shuning uchun tur darajasida kengaytiramiz.
 */
const i18n = {
  fallbackLanguage: ADMIN_LANGUAGE,
  supportedLanguages: { [ADMIN_LANGUAGE]: uz },
} as unknown as NonNullable<Config['i18n']>

export default buildConfig({
  admin: {
    user: Users.slug,
    // date-fns'da o'zbek locale'i yo'q — oy nomlarisiz raqamli format.
    dateFormat: 'dd.MM.yyyy HH:mm',
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  i18n,
  // Sayt yozuvlari (TZ §3.6): lotin — asosiy, kirill — hosila; tarjima bo'lmasa lotinga qaytadi.
  localization: {
    locales: LOCALES.map((code) => ({ code, label: LOCALE_LABELS[code] })),
    defaultLocale: DEFAULT_LOCALE,
    fallback: true,
  },
  collections: [Users, Media, Glossary, TranslitExceptions],
  editor: lexicalEditor(),
  secret: env.PAYLOAD_SECRET ?? '',
  serverURL: env.NEXT_PUBLIC_SITE_URL,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // Faqat server tomonidagi (multipart) yuklashlar uchun; admin'dan fayllar clientUploads bilan
  // to'g'ridan-to'g'ri bucket'ga boradi (imzolangan URL ham shu limitni tekshiradi).
  upload: {
    limits: {
      fileSize: 25 * 1024 * 1024,
    },
  },
  db: postgresAdapter({
    // Runtime — pooler (DATABASE_URL), migratsiyalar — direct (DATABASE_URL_DIRECT).
    pool: getDatabasePoolConfig(env, getDatabaseMode()),
    // Sxema faqat migratsiyalar orqali o'zgaradi (dev'da ham `push` o'chiq),
    // shunda lokal, CI va production bir xil yo'ldan yuradi.
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  sharp,
  plugins: [
    // Lokal: MinIO, production: Cloudflare R2 — farq faqat env'da (TZ §3.1, §3.7).
    s3Storage(getS3StorageOptions(env)),
  ],
})
