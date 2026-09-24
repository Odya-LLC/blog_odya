import type { Locale } from '@blog-odya/shared'

/** Sayt vaqt zonasi — server (Vercel, UTC) va brauzerda bir xil natija uchun doim aniq beriladi. */
export const SITE_TIME_ZONE = 'Asia/Tashkent'

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

function formatter(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let cached = dateFormatters.get(key)
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, { timeZone: SITE_TIME_ZONE, ...options })
    dateFormatters.set(key, cached)
  }
  return cached
}

/** "24-sentabr, 2026" / "24 сентябр, 2026" */
export function formatDate(iso: string, locale: Locale): string {
  return formatter(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
}

/** "14:05" */
export function formatTime(iso: string, locale: Locale): string {
  return formatter(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso),
  )
}

/** "24-sen" / "24 сен" */
export function formatShortDate(iso: string, locale: Locale): string {
  return formatter(locale, { day: 'numeric', month: 'short' }).format(new Date(iso))
}

/** Bugun bo'lsa — faqat vaqt, aks holda qisqa sana + vaqt (lenta uchun). */
export function formatFeedTime(iso: string, locale: Locale, now: Date = new Date()): string {
  const day = formatter(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
  const time = formatTime(iso, locale)
  if (day.format(new Date(iso)) === day.format(now)) return time
  return `${formatShortDate(iso, locale)}, ${time}`
}
