/**
 * Analitika (TZ §9.5, OBLOG-23): GA4 + Yandex Metrica, ID'lar — `site-settings` → "Analitika
 * va veb-master". Har bir tashrifchida, rozilik so'ralmasdan yuklanadi (cookie banner yo'q —
 * egasi qarori, OBLOG-60; `components/analytics/AnalyticsScripts.tsx`); lotin/kirill
 * segmentatsiyasi — `content_group` (`latn` / `cyrl`, URL `/kr/`).
 *
 * Yon ta'sirsiz modul (client komponent ham import qiladi — faqat kichik funksiyalar).
 */

export type ContentGroup = 'latn' | 'cyrl'

export interface AnalyticsConfig {
  /** GA4 Measurement ID (`G-XXXXXXX`). */
  ga4Id: string | null
  /** Yandex Metrica hisoblagich raqami. */
  metricaId: string | null
}

/**
 * ID'lar inline skriptga yoziladi — faqat qat'iy formatdagi qiymatlar qabul qilinadi
 * (admin tasodifan boshqa matn yozsa, analitika o'chiq qoladi; XSS imkoni yo'q).
 */
const GA4_ID = /^G-[A-Z0-9]{4,20}$/
const METRICA_ID = /^\d{4,12}$/

export function toAnalyticsConfig(
  analytics:
    { ga4MeasurementId?: string | null; yandexMetrikaId?: string | null } | null | undefined,
): AnalyticsConfig {
  const ga4 = analytics?.ga4MeasurementId?.trim().toUpperCase() ?? ''
  const metrica = analytics?.yandexMetrikaId?.trim() ?? ''
  return {
    ga4Id: GA4_ID.test(ga4) ? ga4 : null,
    metricaId: METRICA_ID.test(metrica) ? metrica : null,
  }
}

/** Search Console / Yandex Webmaster tasdiq kodlari (`<meta name="…-verification">`). */
export interface SiteVerification {
  google: string | null
  yandex: string | null
}

/** Tasdiq kodi: token belgilari (`A-Za-z0-9_-`), 8–128 ta. */
const VERIFICATION_TOKEN = /^[\w-]{8,128}$/

/**
 * Admin kodni o'zini ham, butun `<meta name="…" content="KOD" />` tegini ham yozishi mumkin —
 * ikkalasidan ham kod ajratiladi; boshqa matn — `null` (meta chizilmaydi).
 */
export function toVerificationToken(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? ''
  const token = /content\s*=\s*["']([^"']*)["']/i.exec(raw)?.[1]?.trim() ?? raw
  return VERIFICATION_TOKEN.test(token) ? token : null
}

export function toSiteVerification(
  analytics:
    | { googleSiteVerification?: string | null; yandexVerification?: string | null }
    | null
    | undefined,
): SiteVerification {
  return {
    google: toVerificationToken(analytics?.googleSiteVerification),
    yandex: toVerificationToken(analytics?.yandexVerification),
  }
}

export function hasAnalytics(config: AnalyticsConfig): boolean {
  return Boolean(config.ga4Id || config.metricaId)
}

export const GA4_SRC = (id: string) =>
  `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
export const METRICA_SRC = 'https://mc.yandex.ru/metrika/tag.js'

/**
 * TopSayt.uz hisoblagichi (OBLOG-80): katalog/reytingda ko'rinish uchun har sahifada, `</body>`
 * oldida `<script async src>`. JSX'dagi `<script async src>` ni React `<head>` ga ko'taradi,
 * skript esa nishonni (`counter/35.svg`) o'zidan keyin qo'yadi — shuning uchun uni `<body>`
 * oxiriga kichik inline yuklovchi qo'shadi (yangi JS chunk yo'q, JS byudjeti ≤ 150 KB).
 * CSP: `script-src`, `connect-src` (hit — `sendBeacon`), `img-src` (nishon) — `topsayt.uz`.
 * Faqat to'liq sahifa yuklanishlari hisoblanadi (client navigatsiyada skript qayta ishlamaydi).
 */
export const TOPSAYT_COUNTER_SRC = 'https://topsayt.uz/counter/35.js'

export const topsaytCounterScript =
  `(function(d){var s=d.createElement('script');s.async=true;` +
  `s.src='${TOPSAYT_COUNTER_SRC}';d.body.appendChild(s)})(document)`

type Queue =((...args: unknown[]) => void) & { a?: unknown[]; l?: number }

/** gtag.js / Metrica `tag.js` global'lari (navbat stub'lari). */
export interface AnalyticsWindow {
  dataLayer?: unknown[]
  gtag?: Queue
  ym?: Queue
}

/**
 * GA4 navbati: `gtag('js')` + `gtag('config', id, { content_group })` (Explorations'da
 * lotin/kirill segmenti). Consent mode yo'q (`denied` default'lar qo'yilmaydi) — oddiy config.
 * gtag.js `dataLayer` da `arguments` obyektlarini kutadi — shuning uchun oddiy `function`.
 * Qayta chaqiruv (`gtag` bor) — hech narsa qilmaydi, `false`.
 */
export function initGa4(win: AnalyticsWindow, id: string, contentGroup: ContentGroup): boolean {
  if (win.gtag) return false
  const dataLayer = (win.dataLayer ??= [])
  win.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments)
  }
  win.gtag('js', new Date())
  win.gtag('config', id, { content_group: contentGroup })
  return true
}

/**
 * Yandex Metrica navbati (rasmiy stub: `ym.a`, `ym.l`) + standart `init` (clickmap, trackLinks,
 * accurateTrackBounce; webvisor yo'q) + `params.content_group` ("Parametry vizitov").
 * Qayta chaqiruv (`ym` bor) — hech narsa qilmaydi, `false`.
 */
export function initMetrica(win: AnalyticsWindow, id: string, contentGroup: ContentGroup): boolean {
  if (win.ym) return false
  const ym: Queue = function () {
    // eslint-disable-next-line prefer-rest-params
    ;(ym.a ??= []).push(arguments)
  }
  ym.l = Date.now()
  win.ym = ym
  ym(Number(id), 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    params: { content_group: contentGroup },
  })
  return true
}

export interface AnalyticsTargets {
  ga4Id: string | null
  metricaId: string | null
  contentGroup: ContentGroup
}

/**
 * Navbat stub'lari + `<script async src>` (CSP `script-src` dagi domenlar; inline skript yo'q).
 * Global (`gtag`/`ym`) allaqachon bo'lsa — o'sha xizmat qayta init/yuklanmaydi. Qaytaradi —
 * qo'shilgan skriptlar manzillari.
 */
export function loadAnalytics(
  win: AnalyticsWindow,
  doc: Pick<Document, 'createElement' | 'head'>,
  { ga4Id, metricaId, contentGroup }: AnalyticsTargets,
): string[] {
  const sources: string[] = []
  if (ga4Id && initGa4(win, ga4Id, contentGroup)) sources.push(GA4_SRC(ga4Id))
  if (metricaId && initMetrica(win, metricaId, contentGroup)) sources.push(METRICA_SRC)
  for (const src of sources) {
    const script = doc.createElement('script')
    script.async = true
    script.src = src
    doc.head.appendChild(script)
  }
  return sources
}

/**
 * `lazyOnload` ekvivalenti: `load` hodisasidan keyin, brauzer bo'sh vaqtida
 * (`requestIdleCallback`, bo'lmasa `setTimeout`) — analitika LCP/TBT'ga ta'sir qilmaydi.
 * Qaytaradi — bekor qilish funksiyasi (faqat brauzerda chaqiriladi).
 */
export function afterLoadIdle(run: () => void): () => void {
  let cancelIdle = () => {}
  const schedule = () => {
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(run)
      cancelIdle = () => window.cancelIdleCallback(handle)
    } else {
      const handle = window.setTimeout(run, 1)
      cancelIdle = () => window.clearTimeout(handle)
    }
  }
  if (document.readyState === 'complete') {
    schedule()
    return () => cancelIdle()
  }
  window.addEventListener('load', schedule, { once: true })
  return () => {
    window.removeEventListener('load', schedule)
    cancelIdle()
  }
}
