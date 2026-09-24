/**
 * Foydalanuvchi tanlovlari (cookie) — tema va yozuv (TZ §3.6, §12.3).
 *
 * Tema: `theme=light|dark`; cookie bo'lmasa — tizim sozlamasi (`prefers-color-scheme`).
 * Sinf `<html class="dark">` ga bo'yash (paint) dan oldin inline skript bilan qo'yiladi — FOUC yo'q,
 * server tomonida cookie o'qilmaydi (sahifalar ISR/statik qoladi).
 *
 * Yozuv: URL'da (`/…` lotin, `/kr/…` kirill); cookie faqat tanlovni eslab qoladi —
 * `Accept-Language` bo'yicha avtomatik redirect yo'q (TZ §3.6).
 */
// Faqat `locales` (barrel emas): client bundle'ga zod sxemalari tushmasligi uchun (JS byudjeti, TZ §8.4).
import { LOCALE_PATH_PREFIX, type Locale } from '@blog-odya/shared/locales'

export const THEME_COOKIE = 'theme'
export const SCRIPT_COOKIE = 'script'
/** Cookie muddati — 1 yil. */
export const PREFERENCE_MAX_AGE = 60 * 60 * 24 * 365

export type Theme = 'light' | 'dark'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/** Brauzerda cookie yozish (faqat client komponentlarda chaqiriladi). */
export function writePreferenceCookie(name: string, value: string): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${PREFERENCE_MAX_AGE}; SameSite=Lax${secure}`
}

/**
 * `<head>` dagi bloklovchi skript: cookie → tizim sozlamasi → `html.dark`.
 * Minimal va bog'liqliksiz bo'lishi kerak (inline, hydration'dan oldin ishlaydi).
 */
export const themeInitScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);var t=m?m[1]:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var d=document.documentElement;d.classList.toggle('dark',t==='dark');d.style.colorScheme=t;}catch(e){}})();`

/** Locale'ga mos yo'l: `withLocalePrefix('uz-Cyrl', '/texnologiyalar')` → `/kr/texnologiyalar`. */
export function withLocalePrefix(locale: Locale, path: string): string {
  const prefix = LOCALE_PATH_PREFIX[locale]
  if (path === '/' || path === '') return prefix || '/'
  return `${prefix}${path.startsWith('/') ? path : `/${path}`}`
}
