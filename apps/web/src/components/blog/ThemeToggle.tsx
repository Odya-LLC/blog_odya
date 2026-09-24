'use client'

import { MoonIcon, SunIcon } from 'lucide-react'
// clsx (tailwind-merge'siz): client bundle'da twMerge bo'lmasin — JS byudjeti (TZ §8.4).
import { clsx as cn } from 'clsx'
import { useEffect } from 'react'

import { buttonVariants } from '@/components/ui/button-variants'
import { THEME_COOKIE, writePreferenceCookie, type Theme } from '@/lib/preferences'

type ThemeToggleProps = {
  label: string
  className?: string
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

function hasThemeCookie() {
  return new RegExp(`(?:^|; )${THEME_COOKIE}=(light|dark)`).test(document.cookie)
}

/**
 * Light/dark almashtirgich. Boshlang'ich holatni `<head>` dagi inline skript qo'yadi (FOUC yo'q),
 * shuning uchun ikonka CSS (`dark:`) bilan tanlanadi — SSR va hydration farqi bo'lmaydi.
 * Tanlov cookie'da (1 yil); cookie bo'lmasa tizim sozlamasi kuzatiladi.
 */
export function ThemeToggle({ label, className }: ThemeToggleProps) {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => {
      if (!hasThemeCookie()) applyTheme(event.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  function toggle() {
    const next: Theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
    applyTheme(next)
    writePreferenceCookie(THEME_COOKIE, next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'rounded-full!', className)}
    >
      <MoonIcon className="dark:hidden" aria-hidden />
      <SunIcon className="hidden dark:block" aria-hidden />
    </button>
  )
}
