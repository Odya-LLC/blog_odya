import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { env } from '@/env'
import { getSiteStrings } from '@/i18n/site'

import { RootDocument } from '../_components/RootDocument'

const LOCALE = 'uz-Cyrl'
const t = getSiteStrings(LOCALE)

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: `${t.siteName} — ${t.tagline}`,
  description: t.tagline,
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0B0F' },
  ],
}

/** Kirill yozuvi root layout'i: `<html lang="uz-Cyrl">` (TZ §3.6). */
export default function KirillLayout({ children }: { children: ReactNode }) {
  return <RootDocument locale={LOCALE}>{children}</RootDocument>
}
