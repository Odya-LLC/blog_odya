import type { Locale } from '@blog-odya/shared'
import type { ReactNode } from 'react'
import { preconnect } from 'react-dom'

import { env } from '@/env'
import { themeInitScript } from '@/lib/preferences'

import { inter } from '../fonts'
import '../styles.css'

/**
 * Ommaviy saytning `<html>` qobig'i. Lotin (`(frontend)/(latn)/layout.tsx`) va kirill
 * (`(frontend)/kr/layout.tsx`) — ikkita root layout, bitta komponent: `<html lang>` joriy
 * yozuvga mos (TZ §3.6: `uz-Latn` / `uz-Cyrl`). Yozuvlar orasida o'tish — to'liq sahifa
 * yuklanishi (root layout almashadi), bu kutilgan.
 */
export function RootDocument({ locale, children }: { locale: Locale; children: ReactNode }) {
  // Rasmlar media domenidan (custom loader) — ulanishni oldindan ochamiz (LCP, TZ §8.4).
  const mediaOrigin = originOf(env.MEDIA_PUBLIC_URL)
  if (mediaOrigin) preconnect(mediaOrigin, { crossOrigin: 'anonymous' })
  return (
    // `dark` klassini inline skript hydration'dan oldin qo'yadi — farq kutilgan.
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Tema: cookie → tizim sozlamasi; bo'yashdan oldin bloklovchi skript (FOUC yo'q, TZ §12.3). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

function originOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}
