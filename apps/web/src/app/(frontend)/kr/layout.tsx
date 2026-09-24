import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { rootLayoutMetadata } from '@/site/seo/pages'

import { RootDocument } from '../_components/RootDocument'

const LOCALE = 'uz-Cyrl'

/** Standart metadata + preview'da `noindex` (TZ §8.3, M1-06). Sahifalar o'zinikini qo'shadi. */
export const metadata: Metadata = rootLayoutMetadata(LOCALE)

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
