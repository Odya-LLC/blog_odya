import { DEFAULT_LOCALE, LOCALES, type Locale } from '@blog-odya/shared'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'path'
import { buildConfig, type Config } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { anyone, isAdmin, isAdminOrEditor } from './access'
import { auditLogPlugin } from './audit/plugin'
import { Authors } from './collections/Authors'
import { Categories } from './collections/Categories'
import { Glossary } from './collections/Glossary'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { ScrapedItems } from './collections/ScrapedItems'
import { Sources } from './collections/Sources'
import { Tags } from './collections/Tags'
import { TranslitExceptions } from './collections/TranslitExceptions'
import { Users } from './collections/Users'
import { getDatabaseMode, getDatabasePoolConfig } from './config/database'
import { getPayloadSecret } from './config/secret'
import { getS3StorageOptions } from './config/storage'
import { env } from './env'
import { Footer } from './globals/Footer'
import { Header } from './globals/Header'
import { ScrapingSettings } from './globals/ScrapingSettings'
import { SiteSettings } from './globals/SiteSettings'
import { TelegramSettings } from './globals/TelegramSettings'
import { uzPluginTranslations } from './i18n/plugins'
import { buildJobsConfig } from './jobs'
import { ADMIN_LANGUAGE, uz } from './i18n/uz'
import { revalidateRedirectsAfterChange } from './site/revalidate'
import { cyrlSyncPlugin } from './translit/cyrlSync'
import { CYRL_SYNC } from './translit/sync-config'

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
  // Plaginlar (seo, redirects) tarjimalari — ularda o'zbek tili yo'q.
  translations: { [ADMIN_LANGUAGE]: uzPluginTranslations },
} as unknown as NonNullable<Config['i18n']>

// `pnpm migrate*` (PAYLOAD_MIGRATING=true) — direct/session ulanish; PAYLOAD_SECRET va S3_* ixtiyoriy.
const databaseMode = getDatabaseMode()

export default buildConfig({
  admin: {
    user: Users.slug,
    // date-fns'da o'zbek locale'i yo'q — oy nomlarisiz raqamli format.
    dateFormat: 'dd.MM.yyyy HH:mm',
    importMap: {
      baseDir: path.resolve(dirname),
    },
    // Tahririyat (M2-04, TZ §6.1): navbat va review view'lari, dashboard vidjeti.
    components: {
      beforeNavLinks: ['@/components/admin/EditorialNavLinks#EditorialNavLinks'],
      beforeDashboard: ['@/components/admin/EditorialStats#EditorialStats'],
      views: {
        newsQueue: {
          Component: '@/components/admin/NewsQueueView#NewsQueueView',
          path: '/news-queue',
          meta: { title: 'Yangiliklar navbati' },
        },
        reviewQueue: {
          Component: '@/components/admin/ReviewQueueView#ReviewQueueView',
          path: '/review',
          meta: { title: 'Tekshiruv navbati' },
        },
      },
    },
  },
  i18n,
  // Sayt yozuvlari (TZ §3.6): lotin — asosiy, kirill — hosila; tarjima bo'lmasa lotinga qaytadi.
  localization: {
    locales: LOCALES.map((code) => ({ code, label: LOCALE_LABELS[code] })),
    defaultLocale: DEFAULT_LOCALE,
    fallback: true,
  },
  collections: [
    Posts,
    Pages,
    Categories,
    Tags,
    Authors,
    Media,
    Users,
    Sources,
    ScrapedItems,
    Glossary,
    TranslitExceptions,
  ],
  globals: [SiteSettings, Header, Footer, TelegramSettings, ScrapingSettings],
  editor: lexicalEditor(),
  // Fon vazifalar (TZ §3.5): feed.poll, scrapeItem; scheduler — JOBS_MODE (src/jobs/index.ts).
  jobs: buildJobsConfig(env.JOBS_MODE),
  secret: getPayloadSecret(env, databaseMode),
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
    pool: getDatabasePoolConfig(env, databaseMode),
    // Sxema faqat migratsiyalar orqali o'zgaradi (dev'da ham `push` o'chiq),
    // shunda lokal, CI va production bir xil yo'ldan yuradi.
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  sharp,
  plugins: [
    // Ierarxik kategoriyalar (TZ §7): `parent` + `breadcrumbs` maydonlari.
    nestedDocsPlugin({
      collections: ['categories'],
      generateLabel: (_, doc) => String(doc.name ?? ''),
      generateURL: (docs) => docs.reduce((url, doc) => `${url}/${String(doc.slug ?? '')}`, ''),
    }),
    // Redirects (TZ §10.10): from, to, type (301/302). Slug o'zgarganda avtomatik yoziladi
    // (`hooks/contentRedirects.ts`); sayt ularni `site/redirects.ts` orqali qo'llaydi.
    redirectsPlugin({
      collections: ['posts', 'pages', 'categories', 'tags', 'authors'],
      redirectTypes: ['301', '302'],
      overrides: {
        labels: { singular: "Yo'naltirish", plural: "Yo'naltirishlar" },
        access: {
          read: anyone,
          create: isAdminOrEditor,
          update: isAdminOrEditor,
          delete: isAdmin,
        },
        hooks: {
          afterChange: [revalidateRedirectsAfterChange],
        },
      },
    }),
    // SEO `meta` (L) guruhi (TZ §8.2, §10.3): title, description, image + focusKeyword, noindex.
    seoPlugin({
      collections: ['posts', 'pages', 'categories', 'tags'],
      uploadsCollection: 'media',
      tabbedUI: true,
      generateTitle: ({ doc, locale }) => {
        const title = String(doc?.title ?? doc?.name ?? '').trim()
        const brand = locale === 'uz-Cyrl' ? 'Блог Одя' : 'Blog Odya'
        return title ? `${title} — ${brand}` : brand
      },
      generateDescription: ({ doc }) => String(doc?.excerpt ?? doc?.description ?? '').trim(),
      generateImage: ({ doc }) => doc?.coverImage?.id ?? doc?.coverImage ?? '',
      fields: ({ defaultFields }) => [
        ...defaultFields,
        {
          name: 'focusKeyword',
          type: 'text',
          label: "Asosiy kalit so'z",
          localized: true,
        },
        {
          name: 'noindex',
          type: 'checkbox',
          label: 'Indekslamaslik (noindex)',
          defaultValue: false,
        },
      ],
    }),
    // Lotin → kirill avtomatik sinxronlash (TZ §3.6): plugin-seo'dan keyin (`meta.*` ham).
    cyrlSyncPlugin(CYRL_SYNC),
    // Lokal: MinIO, production: Cloudflare R2 — farq faqat env'da (TZ §3.1, §3.7).
    // S3_BUCKET berilmasa (masalan, prod migratsiya workflow'ida) plagin o'chiq.
    s3Storage(getS3StorageOptions(env)),
    // Audit log (TZ §6.4): barcha kolleksiya/global o'zgarishlari — oxirida (plaginlar qo'shgan
    // kolleksiyalar ham qamrab olinsin). Feed/pipeline texnik yozuvlari (job) — yozilmaydi.
    auditLogPlugin({
      collections: {
        sources: { skipSystemWrites: true },
        'scraped-items': { skipSystemWrites: true },
        // Seed (`seed:translit`) yozuvlari — foydalanuvchisiz; admin tahrirlari audit qilinadi.
        glossary: { skipSystemWrites: true },
        'translit-exceptions': { skipSystemWrites: true },
      },
    }),
  ],
})
