import { describe, expect, it } from 'vitest'

import {
  ANALYTICS_FALLBACK_MS,
  type AnalyticsTargets,
  ENGAGEMENT_EVENTS,
  GA4_SRC,
  METRICA_SRC,
  metricaInitOptions,
  thirdPartyScript,
  toAnalyticsConfig,
  toSiteVerification,
  TOPSAYT_COUNTER_SRC,
} from '@/site/analytics'

type Listener = () => void
type Queue = ((...args: unknown[]) => void) & { a?: ArrayLike<unknown>[]; l?: number }

/**
 * Soxta brauzer: `load`/faollik hodisalari, `requestIdleCallback`, `setTimeout`, `history` va
 * `<script>` qo'shilishi qayd qilinadi; inline skript `new Function` bilan bajariladi.
 */
function fakeBrowser(readyState: DocumentReadyState = 'complete') {
  const listeners = new Map<string, Set<Listener>>()
  const idle: Listener[] = []
  const timers: Array<{ callback: Listener; ms: number; cleared: boolean }> = []
  const head: Array<{ async: boolean; src: string }> = []
  const body: Array<{ async: boolean; src: string }> = []
  const pushed: string[] = []
  const location = { pathname: '/', href: 'https://blog.test/' }
  const navigate = (path: string) => {
    location.pathname = path.split('?')[0]!
    location.href = `https://blog.test${path}`
    pushed.push(path)
  }
  const win = {
    location,
    history: {
      pushState: (_state: unknown, _title: string, path: string) => navigate(path),
      replaceState: (_state: unknown, _title: string, path: string) => navigate(path),
    },
    requestIdleCallback: (callback: Listener) => idle.push(callback),
    addEventListener: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    removeEventListener: (type: string, listener: Listener) =>
      listeners.get(type)?.delete(listener),
  } as Record<string, unknown> & {
    dataLayer?: ArrayLike<unknown>[]
    gtag?: Queue
    ym?: Queue
    history: { pushState: (...args: unknown[]) => void; replaceState: (...args: unknown[]) => void }
  }
  const doc = {
    readyState,
    createElement: () => ({ async: false, src: '' }),
    head: { appendChild: (node: { async: boolean; src: string }) => head.push(node) },
    body: { appendChild: (node: { async: boolean; src: string }) => body.push(node) },
  }
  const setTimeoutFake = (callback: Listener, ms: number) =>
    timers.push({ callback, ms, cleared: false }) - 1
  const clearTimeoutFake = (id?: number) => {
    if (id !== undefined && timers[id]) timers[id].cleared = true
  }

  const run = (targets: AnalyticsTargets) =>
    new Function('window', 'document', 'setTimeout', 'clearTimeout', thirdPartyScript(targets))(
      win,
      doc,
      setTimeoutFake,
      clearTimeoutFake,
    )
  const fire = (type: string) => [...(listeners.get(type) ?? [])].forEach((listener) => listener())
  const flushIdle = () => idle.splice(0).forEach((callback) => callback())
  const fireTimers = () =>
    timers.filter((timer) => !timer.cleared).forEach((timer) => timer.callback())
  const count = (type: string) => listeners.get(type)?.size ?? 0
  return { win, head, body, timers, run, fire, flushIdle, fireTimers, count }
}

const BOTH: AnalyticsTargets = { ga4Id: 'G-TEST1234', metricaId: '12345678', contentGroup: 'cyrl' }

/**
 * Analitika (TZ §9.5; OBLOG-23, OBLOG-60, OBLOG-80, OBLOG-111): ID tekshiruvi, rozilik yo'q,
 * `content_group`, uchinchi tomon skriptlari faqat faollikda yoki `ANALYTICS_FALLBACK_MS` dan keyin.
 */
describe('analytics', () => {
  it('ID’lar: faqat to‘g‘ri format (inline skriptga XSS tushmaydi)', () => {
    expect(
      toAnalyticsConfig({ ga4MeasurementId: ' g-abc123XYZ ', yandexMetrikaId: '98765432' }),
    ).toEqual({ ga4Id: 'G-ABC123XYZ', metricaId: '98765432' })
    expect(
      toAnalyticsConfig({ ga4MeasurementId: "G-1234');alert(1);//", yandexMetrikaId: '12a' }),
    ).toEqual({ ga4Id: null, metricaId: null })
    expect(toAnalyticsConfig(null)).toEqual({ ga4Id: null, metricaId: null })
  })

  it('faolliksiz: load + idle da hali yuklanmaydi — fallback taymeridan keyin', () => {
    const browser = fakeBrowser('complete')
    browser.run(BOTH)
    for (const type of ENGAGEMENT_EVENTS) expect(browser.count(type)).toBe(1)
    browser.flushIdle()
    expect(browser.head).toEqual([])
    expect(browser.body).toEqual([])
    expect(browser.timers.map((timer) => timer.ms)).toEqual([ANALYTICS_FALLBACK_MS])
    expect(ANALYTICS_FALLBACK_MS).toBeGreaterThanOrEqual(5000)

    browser.fireTimers()
    for (const type of ENGAGEMENT_EVENTS) expect(browser.count(type)).toBe(0)
    expect(browser.head).toEqual([])
    browser.flushIdle()
    // Rozilik so'ralmaydi: ikkala skript async, `<head>` da; TopSayt — `<body>` oxirida.
    expect(browser.head).toEqual([
      { async: true, src: GA4_SRC('G-TEST1234') },
      { async: true, src: METRICA_SRC },
    ])
    expect(browser.body).toEqual([{ async: true, src: TOPSAYT_COUNTER_SRC }])
  })

  it('GA4 va Metrica navbati: content_group (lotin/kirill), `arguments` obyektlari', () => {
    const browser = fakeBrowser('complete')
    browser.run(BOTH)
    browser.fire('scroll')
    browser.flushIdle()
    const { dataLayer, ym } = browser.win
    expect(Object.prototype.toString.call(dataLayer?.[0])).toBe('[object Arguments]')
    const queued = (dataLayer ?? []).map((entry) => Array.from(entry))
    expect(queued[0]?.[0]).toBe('js')
    expect(queued[1]).toEqual(['config', 'G-TEST1234', { content_group: 'cyrl' }])
    expect(typeof ym?.l).toBe('number')
    expect(Array.from(ym?.a?.[0] ?? [])).toEqual([12345678, 'init', metricaInitOptions('cyrl')])
  })

  it('birinchi faollik load dan oldin — load kutiladi; bir marta; fallback yo‘q', () => {
    const browser = fakeBrowser('interactive')
    browser.run(BOTH)
    browser.fire('touchstart')
    browser.fire('scroll')
    for (const type of ENGAGEMENT_EVENTS) expect(browser.count(type)).toBe(0)
    browser.flushIdle()
    expect(browser.head).toEqual([])
    browser.fire('load')
    browser.flushIdle()
    expect(browser.head).toHaveLength(2)
    expect(browser.timers.filter((timer) => !timer.cleared)).toEqual([])

    // Skript qayta bajarilsa ham (masalan, ikki root layout) — ikki marta init/yuklash yo'q.
    browser.run(BOTH)
    browser.fire('scroll')
    browser.flushIdle()
    expect(browser.head).toHaveLength(2)
    expect(browser.body).toHaveLength(1)
    expect(browser.win.dataLayer).toHaveLength(2)
  })

  it('ID’lar yo‘q — faqat TopSayt; gtag/ym va history o‘zgarmaydi', () => {
    const browser = fakeBrowser('complete')
    const { pushState } = browser.win.history
    browser.run({ ga4Id: null, metricaId: null, contentGroup: 'latn' })
    browser.fire('pointerdown')
    browser.flushIdle()
    expect(browser.head).toEqual([])
    expect(browser.body).toEqual([{ async: true, src: TOPSAYT_COUNTER_SRC }])
    expect(browser.win.gtag).toBeUndefined()
    expect(browser.win.ym).toBeUndefined()
    expect(browser.win.history.pushState).toBe(pushState)
  })

  it('faqat Metrica: client navigatsiyada yo‘l o‘zgarsa `hit` (referer bilan)', () => {
    const browser = fakeBrowser('complete')
    browser.run({ ga4Id: null, metricaId: '12345678', contentGroup: 'latn' })
    // Yuklanishdan oldingi navigatsiya — `ym` hali yo'q, `init` joriy sahifani hisoblaydi.
    browser.win.history.pushState(null, '', '/a')
    browser.fire('keydown')
    browser.flushIdle()
    expect(browser.win.gtag).toBeUndefined()
    expect(browser.head).toEqual([{ async: true, src: METRICA_SRC }])

    browser.win.history.pushState(null, '', '/b')
    browser.win.history.replaceState(null, '', '/b?page=2')
    const hits = (browser.win.ym?.a ?? []).map((entry) => Array.from(entry)).slice(1)
    expect(hits).toEqual([
      [12345678, 'hit', 'https://blog.test/b', { referer: 'https://blog.test/a' }],
    ])
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
