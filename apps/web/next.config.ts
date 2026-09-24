import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

import { parseEnv, resolveEnvMode } from './src/env.schema'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)
const monorepoRoot = path.resolve(dirname, '../..')

const nextConfig: NextConfig = {
  transpilePackages: ['@blog-odya/shared', '@blog-odya/guidelines'],
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
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
  turbopack: {
    root: monorepoRoot,
  },
}

/**
 * Env'ni faza bo'yicha tekshirish (`src/env.schema.ts`):
 * - `next build` — DB/sirlar majburiy emas (build ularni ishlatmaydi), faqat format tekshiriladi;
 * - `next dev` / `next start` — to'liq tekshiruv, majburiy qiymat bo'lmasa ishga tushmaydi.
 * Vercel runtime'da `next.config` bajarilmaydi — u yerda `src/env.ts` birinchi import'da tekshiradi.
 */
export default function config(phase: string) {
  parseEnv(process.env, resolveEnvMode(process.env, phase))
  return withPayload(nextConfig, { devBundleServerPackages: false })
}
