import type { Metadata, Viewport } from 'next'
import React from 'react'

import { themeInitScript } from '@/lib/preferences'

import { inter } from './fonts'
import './styles.css'

export const metadata: Metadata = {
  title: 'Blog Odya',
  description: "AI, IT, texnologiya va kibersport yangiliklari o'zbek tilida",
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0B0F' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `dark` klassini inline skript hydration'dan oldin qo'yadi — farq kutilgan.
    <html lang="uz-Latn" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Tema: cookie → tizim sozlamasi; bo'yashdan oldin bloklovchi skript (FOUC yo'q, TZ §12.3). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
