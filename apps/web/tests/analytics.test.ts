import { describe, expect, it } from 'vitest'

import {
  consentCookie,
  ga4InitScript,
  hasAnalytics,
  metricaInitScript,
  readConsent,
  toAnalyticsConfig,
} from '@/site/analytics'

/** Analitika (OBLOG-23, TZ §9.5): ID tekshiruvi, rozilik cookie'si, `content_group`. */
describe('analytics', () => {
  it('ID’lar: faqat to‘g‘ri format (inline skriptga XSS tushmaydi)', () => {
    expect(
      toAnalyticsConfig({ ga4MeasurementId: ' g-abc123XYZ ', yandexMetrikaId: '98765432' }),
    ).toEqual({ ga4Id: 'G-ABC123XYZ', metricaId: '98765432' })
    expect(
      toAnalyticsConfig({ ga4MeasurementId: "G-1234');alert(1);//", yandexMetrikaId: '12a' }),
    ).toEqual({ ga4Id: null, metricaId: null })
    expect(hasAnalytics(toAnalyticsConfig(null))).toBe(false)
    expect(hasAnalytics(toAnalyticsConfig({ yandexMetrikaId: '12345678' }))).toBe(true)
  })

  it('rozilik cookie’si', () => {
    expect(readConsent('')).toBeNull()
    expect(readConsent('theme=dark; cookie_consent=granted')).toBe('granted')
    expect(readConsent('cookie_consent=denied; theme=dark')).toBe('denied')
    expect(readConsent('cookie_consent=maybe')).toBeNull()
    expect(readConsent('xcookie_consent=granted')).toBeNull()
    expect(consentCookie('granted', true)).toBe(
      'cookie_consent=granted; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
    )
    expect(consentCookie('denied', false)).not.toContain('Secure')
  })

  it('content_group — lotin/kirill segmenti', () => {
    expect(ga4InitScript('G-TEST1234', 'cyrl')).toContain(
      `gtag('config',"G-TEST1234",{content_group:"cyrl"})`,
    )
    const metrica = metricaInitScript('12345678', 'latn')
    expect(metrica).toContain(`ym(12345678,'init',`)
    expect(metrica).toContain('"params":{"content_group":"latn"}')
  })
})
