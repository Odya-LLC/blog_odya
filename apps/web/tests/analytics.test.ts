import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  afterLoadIdle,
  type AnalyticsWindow,
  GA4_SRC,
  hasAnalytics,
  initGa4,
  initMetrica,
  loadAnalytics,
  METRICA_SRC,
  toAnalyticsConfig,
  toSiteVerification,
} from '@/site/analytics'

/** Soxta `document`: `createElement('script')` + `head.appendChild` (qo'shilganlar ro'yxati). */
function fakeDocument() {
  const appended: Array<{ async: boolean; src: string }> = []
  const doc = {
    createElement: () => ({ async: false, src: '' }),
    head: { appendChild: (node: { async: boolean; src: string }) => appended.push(node) },
  } as unknown as Pick<Document, 'createElement' | 'head'>
  return { doc, appended }
}

/** Analitika (TZ §9.5; OBLOG-23, OBLOG-60): ID tekshiruvi, yuklash (rozilik yo'q), `content_group`. */
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

  it('yuklash: rozilik so‘ralmaydi — ikkala skript async, bir marta', () => {
    const win: AnalyticsWindow = {}
    const { doc, appended } = fakeDocument()
    const targets = { ga4Id: 'G-TEST1234', metricaId: '12345678', contentGroup: 'latn' as const }
    expect(loadAnalytics(win, doc, targets)).toEqual([GA4_SRC('G-TEST1234'), METRICA_SRC])
    expect(appended).toEqual([
      { async: true, src: 'https://www.googletagmanager.com/gtag/js?id=G-TEST1234' },
      { async: true, src: 'https://mc.yandex.ru/metrika/tag.js' },
    ])
    // Consent mode yo'q: `gtag('consent', …)` navbatda emas.
    const commands = (win.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>))
    expect(commands.map((command) => command[0])).toEqual(['js', 'config'])
    // Qayta chaqiruv (remount) — ikki marta init/yuklash yo'q.
    expect(loadAnalytics(win, doc, targets)).toEqual([])
    expect(appended).toHaveLength(2)
    expect(win.dataLayer).toHaveLength(2)
    expect(win.ym?.a).toHaveLength(1)
  })

  it('yuklash: faqat berilgan ID — faqat o‘sha xizmat', () => {
    const onlyMetrica = fakeDocument()
    const win: AnalyticsWindow = {}
    expect(
      loadAnalytics(win, onlyMetrica.doc, {
        ga4Id: null,
        metricaId: '12345678',
        contentGroup: 'cyrl',
      }),
    ).toEqual([METRICA_SRC])
    expect(win.gtag).toBeUndefined()
    expect(win.dataLayer).toBeUndefined()

    const none = fakeDocument()
    expect(
      loadAnalytics({}, none.doc, { ga4Id: null, metricaId: null, contentGroup: 'latn' }),
    ).toEqual([])
    expect(none.appended).toEqual([])
  })

  describe('afterLoadIdle — load dan keyin, bo‘sh vaqtda', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    function stubBrowser(readyState: DocumentReadyState, idle: boolean) {
      const listeners = new Map<string, () => void>()
      const idleCallbacks: Array<() => void> = []
      vi.stubGlobal('document', { readyState })
      vi.stubGlobal('window', {
        requestIdleCallback: idle
          ? (callback: () => void) => idleCallbacks.push(callback)
          : undefined,
        cancelIdleCallback: vi.fn(),
        setTimeout: (callback: () => void) => idleCallbacks.push(callback),
        clearTimeout: vi.fn(),
        addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
        removeEventListener: (type: string) => listeners.delete(type),
      })
      return { listeners, idleCallbacks }
    }

    it('load hali bo‘lmagan — load kutiladi, keyin idle', () => {
      const { listeners, idleCallbacks } = stubBrowser('interactive', true)
      const run = vi.fn()
      afterLoadIdle(run)
      expect(idleCallbacks).toHaveLength(0)
      listeners.get('load')?.()
      expect(run).not.toHaveBeenCalled()
      idleCallbacks.forEach((callback) => callback())
      expect(run).toHaveBeenCalledOnce()
    })

    it('load bo‘lgan, requestIdleCallback yo‘q — setTimeout; bekor qilish', () => {
      const { listeners, idleCallbacks } = stubBrowser('complete', false)
      afterLoadIdle(vi.fn())
      expect(listeners.size).toBe(0)
      expect(idleCallbacks).toHaveLength(1)

      const pending = stubBrowser('loading', true)
      const cancel = afterLoadIdle(vi.fn())
      cancel()
      expect(pending.listeners.has('load')).toBe(false)
    })
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
