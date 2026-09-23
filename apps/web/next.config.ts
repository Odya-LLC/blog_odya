import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

// Env'ni build/dev boshida tekshirish (SKIP_ENV_VALIDATION=1 bilan o'tkazib yuboriladi).
import './src/env'

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

export default withPayload(nextConfig, { devBundleServerPackages: false })
