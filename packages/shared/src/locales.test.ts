import { describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, isLocale, LOCALE_PATH_PREFIX, LOCALES } from './locales'

describe('locales', () => {
  it('lotin — asosiy locale', () => {
    expect(DEFAULT_LOCALE).toBe('uz-Latn')
    expect(LOCALES).toEqual(['uz-Latn', 'uz-Cyrl'])
  })

  it('kirill /kr prefiksi bilan', () => {
    expect(LOCALE_PATH_PREFIX['uz-Cyrl']).toBe('/kr')
    expect(LOCALE_PATH_PREFIX['uz-Latn']).toBe('')
  })

  it('isLocale faqat maʼlum locale’larni qabul qiladi', () => {
    expect(isLocale('uz-Cyrl')).toBe(true)
    expect(isLocale('ru')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })
})
