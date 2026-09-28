/**
 * Analitika (TZ §9.5, OBLOG-23): GA4 + Yandex Metrica, ID'lar — `site-settings` → "Analitika
 * va veb-master". Skriptlar faqat cookie roziligidan keyin yuklanadi
 * (`components/analytics/ConsentAnalytics.tsx`); lotin/kirill segmentatsiyasi — `content_group`
 * (`latn` / `cyrl`, URL `/kr/`).
 *
 * Yon ta'sirsiz modul (client komponent ham import qiladi — faqat kichik funksiyalar).
 */

/** Rozilik cookie'si: `granted` — analitika yoqilgan, `denied` — rad etilgan. */
export const CONSENT_COOKIE = 'cookie_consent'
export type ConsentValue = 'granted' | 'denied'
/** Rozilik — 1 yil, rad etish — 6 oy (keyin banner yana so'raydi). */
export const CONSENT_MAX_AGE: Record<ConsentValue, number> = {
  granted: 60 * 60 * 24 * 365,
  denied: 60 * 60 * 24 * 182,
}

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

/** `document.cookie` → rozilik qiymati (yo'q/noma'lum — `null`, banner ko'rsatiladi). */
export function readConsent(cookie: string): ConsentValue | null {
  const match = new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=(granted|denied)(?:;|$)`).exec(cookie)
  return (match?.[1] as ConsentValue | undefined) ?? null
}

export function consentCookie(value: ConsentValue, secure: boolean): string {
  return `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE[value]}; SameSite=Lax${secure ? '; Secure' : ''}`
}

/** GA4: `gtag('config', …, { content_group })` — Explorations'da lotin/kirill segmenti. */
export function ga4InitScript(id: string, contentGroup: ContentGroup): string {
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(id)},{content_group:${JSON.stringify(contentGroup)}});`
}

/** Yandex Metrica: navbat stub'i + `init` (`params.content_group` — "Parametry vizitov"). */
export function metricaInitScript(id: string, contentGroup: ContentGroup): string {
  const options = {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    params: { content_group: contentGroup },
  }
  return `window.ym=window.ym||function(){(window.ym.a=window.ym.a||[]).push(arguments)};window.ym.l=1*new Date();window.ym(${Number(id)},'init',${JSON.stringify(options)});`
}

export const GA4_SRC = (id: string) =>
  `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
export const METRICA_SRC = 'https://mc.yandex.ru/metrika/tag.js'
