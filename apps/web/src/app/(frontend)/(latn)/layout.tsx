import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { rootMetadata } from '../_components/root-metadata'
import { RootDocument } from '../_components/RootDocument'

const LOCALE = 'uz-Latn'

/** Standart metadata (preview'da `noindex`) + veb-master tasdiq kodlari (`root-metadata`). */
export const generateMetadata = (): Promise<Metadata> => rootMetadata(LOCALE)

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0B0F' },
  ],
}

/** Lotin yozuvi root layout'i: `<html lang="uz-Latn">` (TZ §3.6). */
export default function LotinLayout({ children }: { children: ReactNode }) {
  return <RootDocument locale={LOCALE}>{children}</RootDocument>
}
