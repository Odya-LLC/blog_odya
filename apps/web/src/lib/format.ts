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

export const COMPACT_UNITS: Record<Locale, { thousand: string; million: string }> = {
  'uz-Latn': { thousand: 'ming', million: 'mln' },
  'uz-Cyrl': { thousand: 'минг', million: 'млн' },
}

function compactPart(n: number, unit: number): string {
  // 1–9,9 — bir kasr xonasi ("1,2"), 10+ — butun. Pastga yaxlitlanadi (butun sonlarda — suzuvchi
  // nuqta xatosiz): 999 999 → "999 ming", 1 950 → "1,9 ming".
  const tenths = Math.floor(n / (unit / 10))
  if (tenths >= 100) return String(Math.floor(tenths / 10))
  return tenths % 10 === 0 ? String(tenths / 10) : `${Math.floor(tenths / 10)},${tenths % 10}`
}

/** Ko'rishlar soni (OBLOG-69): "845", "1,2 ming", "12 ming", "3,4 mln" / "1,2 минг". */
export function formatCompactCount(value: number, locale: Locale): string {
  const n = Math.max(0, Math.floor(value))
  const units = COMPACT_UNITS[locale]
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${compactPart(n, 1000)} ${units.thousand}`
  return `${compactPart(n, 1_000_000)} ${units.million}`
}
