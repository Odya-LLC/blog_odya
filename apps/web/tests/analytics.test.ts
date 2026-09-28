import { describe, expect, it } from 'vitest'

import { BANNER_BUTTON } from '@/components/analytics/banner-classes'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  type AnalyticsWindow,
  consentCookie,
  hasAnalytics,
  initGa4,
  initMetrica,
  readConsent,
  toAnalyticsConfig,
  toSiteVerification,
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

  it('content_group — lotin/kirill segmenti; qayta init yo‘q', () => {
    const win: AnalyticsWindow = {}
    expect(initGa4(win, 'G-TEST1234', 'cyrl')).toBe(true)
    // gtag.js `arguments` obyektlarini kutadi (massiv emas).
    const queued = (win.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>))
    expect(Object.prototype.toString.call(win.dataLayer?.[0])).toBe('[object Arguments]')
    expect(queued[0]?.[0]).toBe('js')
    expect(queued[1]).toEqual(['config', 'G-TEST1234', { content_group: 'cyrl' }])
    expect(initGa4(win, 'G-TEST1234', 'cyrl')).toBe(false)
    expect(win.dataLayer).toHaveLength(2)

    expect(initMetrica(win, '12345678', 'latn')).toBe(true)
    expect(typeof win.ym?.l).toBe('number')
    expect(Array.from(win.ym?.a?.[0] as ArrayLike<unknown>)).toEqual([
      12345678,
      'init',
      {
        clickmap: true,
        trackLinks: true,
        accurateTrackBounce: true,
        params: { content_group: 'latn' },
      },
    ])
    expect(initMetrica(win, '12345678', 'latn')).toBe(false)
    expect(win.ym?.a).toHaveLength(1)
  })

  it('banner tugmalari klasslari buttonVariants bilan bir xil', () => {
    expect(BANNER_BUTTON.accept).toBe(buttonVariants({ size: 'sm' }))
    expect(BANNER_BUTTON.decline).toBe(buttonVariants({ variant: 'outline', size: 'sm' }))
  })

  it('veb-master tasdiq kodlari: kod yoki butun <meta> teg', () => {
    expect(
      toSiteVerification({
        googleSiteVerification:
          ' <meta name="google-site-verification" content="AbC-123_xyzTOKEN" /> ',
        yandexVerification: '0123456789abcdef',
      }),
    ).toEqual({ google: 'AbC-123_xyzTOKEN', yandex: '0123456789abcdef' })
    expect(
      toSiteVerification({ googleSiteVerification: '"><script>', yandexVerification: 'short' }),
    ).toEqual({ google: null, yandex: null })
    expect(toSiteVerification(null)).toEqual({ google: null, yandex: null })
  })
})
