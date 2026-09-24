'use client'

import type { Locale } from '@blog-odya/shared/locales'
import Link from 'next/link'
// clsx (tailwind-merge'siz): client bundle'da twMerge bo'lmasin — JS byudjeti (TZ §8.4).
import { clsx as cn } from 'clsx'

import { SCRIPT_COOKIE, writePreferenceCookie } from '@/lib/preferences'

type ScriptSwitcherProps = {
  locale: Locale
  /** Joriy sahifaning ikkala yozuvdagi URL'i (M1-05: `/{category}/{slug}` ↔ `/kr/{category}/{slug}`). */
  hrefs: Record<Locale, string>
  label: string
  className?: string
}

const OPTIONS: Array<{ locale: Locale; text: string }> = [
  { locale: 'uz-Latn', text: 'Lotin' },
  { locale: 'uz-Cyrl', text: 'Кирилл' },
]

/**
 * "Lotin / Кирилл" almashtirgich (TZ §3.6): oddiy havolalar — JS'siz ham ishlaydi; bosilganda
 * tanlov cookie'ga yoziladi. `Accept-Language` bo'yicha avtomatik redirect yo'q.
 */
export function ScriptSwitcher({ locale, hrefs, label, className }: ScriptSwitcherProps) {
  return (
    <nav
      aria-label={label}
      className={cn('inline-flex rounded-full border border-border bg-surface p-0.5', className)}
    >
      {OPTIONS.map((option) => {
        const active = option.locale === locale
        return (
          <Link
            key={option.locale}
            href={hrefs[option.locale]}
            lang={option.locale}
            hrefLang={option.locale}
            aria-current={active ? 'true' : undefined}
            onClick={() => writePreferenceCookie(SCRIPT_COOKIE, option.locale)}
            className={cn(
              'inline-flex h-8 items-center rounded-full px-2.5 text-xs font-semibold transition-colors sm:px-3',
              active ? 'bg-fg text-bg' : 'text-muted hover:text-fg',
            )}
          >
            {option.text}
          </Link>
        )
      })}
    </nav>
  )
}
