import type { ComponentProps, ReactNode } from 'react'

import { getSiteStrings } from '@/i18n/site'
import { cn } from '@/lib/utils'

import { Footer } from './Footer'
import { Header } from './Header'
import type { Locale } from './types'

type SiteShellProps = {
  locale: Locale
  header: Omit<ComponentProps<typeof Header>, 'locale'>
  footer: Omit<ComponentProps<typeof Footer>, 'locale'>
  children: ReactNode
  className?: string
}

/**
 * Sahifa karkasi: "Asosiy kontentga o'tish" havolasi (klaviatura, WCAG 2.4.1) → Header →
 * `<main id="content">` → Footer. `lang` — joriy yozuv (M1-05 da `<html lang>` ham shunga mos).
 */
export function SiteShell({ locale, header, footer, children, className }: SiteShellProps) {
  const t = getSiteStrings(locale)
  return (
    <div lang={locale} className="flex min-h-dvh flex-col">
      <a
        href="#content"
        className="sr-only z-50 rounded-md bg-accent px-4 py-2 font-semibold text-accent-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t.skipToContent}
      </a>
      <Header locale={locale} {...header} />
      <main id="content" tabIndex={-1} className={cn('flex-1 outline-none', className)}>
        {children}
      </main>
      <Footer locale={locale} {...footer} />
    </div>
  )
}

/** Sahifa konteyneri — max 1280 px, 16/24 px chekka. */
export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 lg:px-6', className)} {...props} />
}
