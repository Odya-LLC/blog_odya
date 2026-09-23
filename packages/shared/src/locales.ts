/**
 * Sayt yozuvlari (Payload localization locale'lari).
 * Lotin — asosiy manba (source of truth), kirill — avtomatik hosila (TZ §3.6).
 */
export const LOCALES = ['uz-Latn', 'uz-Cyrl'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'uz-Latn'

/** Har bir locale uchun URL prefiksi: lotin — `/`, kirill — `/kr` (TZ §3.6, §8.1). */
export const LOCALE_PATH_PREFIX: Record<Locale, string> = {
  'uz-Latn': '',
  'uz-Cyrl': '/kr',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}
