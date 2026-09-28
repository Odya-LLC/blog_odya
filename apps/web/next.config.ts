import { withPayload } from '@payloadcms/next/withPayload'
import { withSentryConfig } from '@sentry/nextjs/config'
import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import path from 'path'
import { fileURLToPath } from 'url'

import { securityHeaderRules } from './src/config/security-headers'
import { parseEnv, resolveEnvMode } from './src/env.schema'
import { isIndexingAllowed } from './src/site/seo/config'
import {
  FEED_REWRITES,
  INDEXNOW_KEY_REWRITE,
  TRAILING_SLASH_REDIRECTS,
} from './src/site/seo/rewrites'
import { NOINDEX_HEADER } from './src/site/seo/robots'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)
const monorepoRoot = path.resolve(dirname, '../..')

const nextConfig: NextConfig = {
  transpilePackages: ['@blog-odya/shared', '@blog-odya/guidelines'],
  // `X-Powered-By` (Next.js / Payload) — texnologiya haqida ortiqcha ma'lumot (OBLOG-23).
  poweredByHeader: false,
  images: {
    // Vercel Image Optimization (`/_next/image`) ishlatilmaydi (TZ §3.7.2, §8.4): loader tayyor
    // WebP variantlarni (thumb 320 / card 640 / hero 1280 / full 1920) media domenidan tanlaydi.
    loader: 'custom',
    loaderFile: './src/lib/image-loader.ts',
    // srcset kengliklari — media variantlariga mos (ortiqcha takroriy nomzodlarsiz).
    deviceSizes: [640, 1280, 1920],
    imageSizes: [320],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  outputFileTracingRoot: monorepoRoot,
  // `next/og` shriftlari `fs` bilan o'qiladi — OG route funksiyalariga qo'shiladi (M1-06).
  outputFileTracingIncludes: {
    '/og/**': ['./assets/og-fonts/*.ttf'],
    // MCP resource/prompt'lari `packages/guidelines/*.md` ni `fs` bilan o'qiydi (M2-06).
    '/api/mcp': ['../../packages/guidelines/*.md'],
    // Admin "MCP qo'llanma" (`/admin/mcp`, OBLOG-43) `docs/mcp.md` ni va reestr uchun
    // ko'rsatmalarni `fs` bilan o'qiydi.
    '/admin/**': ['../../docs/mcp.md', '../../packages/guidelines/*.md'],
  },
  // RSS: `/rss.xml`, `/kr/rss.xml`, `/{category}/rss.xml` → `/feeds/…`; IndexNow kalit fayli
  // `/{key}.txt` → `/indexnow/{key}` (src/site/seo/rewrites.ts).
  rewrites: async () => [...FEED_REWRITES, INDEXNOW_KEY_REWRITE],
  // OBLOG-50: trailing slash'ni `src/proxy.ts` hal qiladi — spam `/products/1/` birdaniga 410
  // (Next'ning o'rnatilgan 308'i proxy'dan oldin ishlardi). `/api`, `/admin` — `redirects`.
  skipTrailingSlashRedirect: true,
  redirects: async () => [...TRAILING_SLASH_REDIRECTS],
  turbopack: {
    root: monorepoRoot,
  },
  env: {
    // Brauzer Sentry'si (`src/instrumentation-client.ts`): alohida `NEXT_PUBLIC_SENTRY_DSN`
    // berilmasa — `SENTRY_DSN` (DSN sir emas, u baribir brauzerga chiqadi).
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || '',
  },
}

/**
 * Javob sarlavhalari:
 * - security headers (TZ §9.2, OBLOG-23): CSP, HSTS, X-Frame-Options, Referrer-Policy,
 *   Permissions-Policy — `src/config/security-headers.ts`;
 * - preview / `SEO_NOINDEX=1`: barcha javoblarga `X-Robots-Tag: noindex` (TZ §8.3, M1-06).
 */
function headersFor(phase: string): NextConfig['headers'] {
  return async () => [
    ...securityHeaderRules(process.env, { dev: phase === PHASE_DEVELOPMENT_SERVER }),
    ...(isIndexingAllowed(process.env)
      ? []
      : [
          {
            source: '/:path*',
            headers: [{ key: NOINDEX_HEADER.key, value: NOINDEX_HEADER.value }],
          },
        ]),
  ]
}

/**
 * Sentry (TZ §9.4, OBLOG-23): build plagini faqat DSN yoki `SENTRY_AUTH_TOKEN` berilganda
 * ulanadi — sirlarsiz build (CI, Preview) avvalgidek. Source map'lar Sentry'ga faqat
 * `SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG`, `SENTRY_PROJECT`) bilan yuklanadi va keyin build
 * papkasidan o'chiriladi (brauzerga ochilmaydi).
 */
function withSentry(config: NextConfig): NextConfig {
  const { SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN } = process.env
  if (!SENTRY_DSN && !NEXT_PUBLIC_SENTRY_DSN && !SENTRY_AUTH_TOKEN) return config
  return withSentryConfig(config, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: SENTRY_AUTH_TOKEN,
    sourcemaps: { disable: !SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
    widenClientFileUpload: true,
    silent: !process.env.CI,
    telemetry: false,
  })
}

/**
 * Env'ni faza bo'yicha tekshirish (`src/env.schema.ts`):
 * - `next build` — DB/sirlar majburiy emas (build ularni ishlatmaydi), faqat format tekshiriladi;
 * - `next dev` / `next start` — to'liq tekshiruv, majburiy qiymat bo'lmasa ishga tushmaydi.
 * Vercel runtime'da `next.config` bajarilmaydi — u yerda `src/env.ts` birinchi import'da tekshiradi.
 */
export default function config(phase: string) {
  parseEnv(process.env, resolveEnvMode(process.env, phase))
  return withSentry(
    withPayload({ ...nextConfig, headers: headersFor(phase) }, { devBundleServerPackages: false }),
  )
}
