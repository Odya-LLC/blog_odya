/**
 * Analitika (TZ §9.5, OBLOG-23): GA4 + Yandex Metrica, ID'lar — `site-settings` → "Analitika
 * va veb-master". Har bir tashrifchida, rozilik so'ralmasdan yuklanadi (cookie banner yo'q —
 * egasi qarori, OBLOG-60) — inline skript `thirdPartyScript` (OBLOG-111: birinchi faollikda yoki
 * 5 s dan keyin); lotin/kirill segmentatsiyasi — `content_group` (`latn` / `cyrl`, URL `/kr/`).
 *
 * Yon ta'sirsiz modul.
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

export const GA4_SRC = (id: string) =>
  `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
export const METRICA_SRC = 'https://mc.yandex.ru/metrika/tag.js'

/**
 * TopSayt.uz hisoblagichi (OBLOG-80): katalog/reytingda ko'rinish uchun har sahifada. Skript
 * nishonni (`counter/35.svg`) o'zidan keyin qo'yadi — shuning uchun `<body>` oxiriga qo'shiladi.
 * CSP: `script-src`, `connect-src` (hit — `sendBeacon`), `img-src` (nishon) — `topsayt.uz`.
 * Faqat to'liq sahifa yuklanishlari hisoblanadi (client navigatsiyada skript qayta ishlamaydi).
 */
export const TOPSAYT_COUNTER_SRC = 'https://topsayt.uz/counter/35.js'

/** Foydalanuvchi faolligi belgilari — birinchisida uchinchi tomon skriptlari yuklanadi. */
export const ENGAGEMENT_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
] as const

/**
 * Faollik bo'lmasa — `load` + bo'sh vaqtdan keyin shuncha ms o'tib baribir yuklanadi.
 * Lighthouse o'lchovi `load` dan ~2–3 s keyin tugaydi (tarmoq va CPU 1 s jim) — 5 s undan keyin.
 */
export const ANALYTICS_FALLBACK_MS = 5000

export interface AnalyticsTargets {
  ga4Id: string | null
  metricaId: string | null
  contentGroup: ContentGroup
}

/** Metrica `init` parametrlari: clickmap, trackLinks, accurateTrackBounce (webvisor yo'q). */
export const metricaInitOptions = (contentGroup: ContentGroup) => ({
  clickmap: true,
  trackLinks: true,
  accurateTrackBounce: true,
  params: { content_group: contentGroup },
})

/**
 * Uchinchi tomon skriptlari (GA4, Yandex Metrica, TopSayt) — root layout'dagi bitta inline skript
 * (TZ §9.5; OBLOG-23, OBLOG-60, OBLOG-80, OBLOG-111). React chunk'i yo'q (CSP
 * `script-src 'unsafe-inline'`, `pageviews/beacon.ts` kabi).
 *
 * Qachon: `load` dan keyin **va** foydalanuvchi birinchi faolligida (scroll, teginish, sichqoncha,
 * klaviatura — `ENGAGEMENT_EVENTS`) yoki faolliksiz `ANALYTICS_FALLBACK_MS` o'tib, brauzer bo'sh
 * vaqtida (`requestIdleCallback`). Rozilik so'ralmaydi (cookie banner yo'q — egasi qarori, OBLOG-60).
 *
 * Nega kechiktiriladi (OBLOG-111): OBLOG-60 dan beri `gtag.js` (~190 KB gzip) + Metrica `tag.js`
 * (~90 KB) har tashrifda `load` + idle'da yuklanardi — bu hali Lighthouse oynasi ichida: Vercel
 * Preview o'lchovida birinchi yuklash JS ~150 KB → ~440 KB (byudjet 150 KB, TZ §8.4), TBT oshib
 * kategoriya Performance < 0.9 edi. Endi ular sahifa yuklanishi bilan raqobatlashmaydi.
 * Cheklov: `ANALYTICS_FALLBACK_MS` dan oldin hech narsa qilmay yopilgan tashrif hisoblanmaydi.
 *
 * - GA4: `gtag('js')` + `gtag('config', id, { content_group })` (lotin/kirill segmenti), consent
 *   mode yo'q. gtag.js `dataLayer` da `arguments` obyektlarini kutadi. Client navigatsiyada
 *   `page_view` ni enhanced measurement (history) o'zi yuboradi.
 * - Metrica: rasmiy navbat stub'i (`ym.a`, `ym.l`) + `init` (`metricaInitOptions`); client
 *   navigatsiyada (`history.pushState`/`replaceState`, `popstate` — yo'l o'zgarsa) `hit` qo'lda.
 * - Global (`gtag`/`ym`) allaqachon bo'lsa — qayta init/yuklash yo'q; skript ikki marta ishlamaydi.
 * ID'lar `toAnalyticsConfig` da qat'iy formatdan o'tgan (inline skriptga XSS tushmaydi).
 */
export function thirdPartyScript({ ga4Id, metricaId, contentGroup }: AnalyticsTargets): string {
  const json = JSON.stringify
  const ga4 = ga4Id
    ? `if(!w.gtag){var l=w.dataLayer=w.dataLayer||[];w.gtag=function(){l.push(arguments)};` +
      `w.gtag('js',new Date());w.gtag('config',${json(ga4Id)},{content_group:${json(contentGroup)}});` +
      `a(${json(GA4_SRC(ga4Id))},d.head)}`
    : ''
  const metricaNumber = metricaId ? Number(metricaId) : 0
  const metrica = metricaId
    ? `if(!w.ym){var y=w.ym=function(){(y.a=y.a||[]).push(arguments)};y.l=+new Date;` +
      `y(${metricaNumber},'init',${json(metricaInitOptions(contentGroup))});a(${json(METRICA_SRC)},d.head)}`
    : ''
  const metricaHits = metricaId
    ? `var c=w.location,P=c.pathname,U=c.href;` +
      `function n(){if(c.pathname!=P){P=c.pathname;w.ym&&w.ym(${metricaNumber},'hit',c.href,{referer:U})}U=c.href}` +
      `['pushState','replaceState'].forEach(function(k){var f=w.history[k];` +
      `w.history[k]=function(){var x=f.apply(this,arguments);n();return x}});` +
      `w.addEventListener('popstate',n);`
    : ''
  return (
    `(function(w,d){if(w.__bo3p)return;w.__bo3p=1;` +
    `var s=0,t,o={capture:!0,passive:!0},E=${json(ENGAGEMENT_EVENTS)};` +
    `function a(u,p){var e=d.createElement('script');e.async=!0;e.src=u;p.appendChild(e)}` +
    `function L(f){d.readyState=='complete'?f():w.addEventListener('load',f,{once:!0})}` +
    `function I(f){w.requestIdleCallback?w.requestIdleCallback(f):setTimeout(f,1)}` +
    `function r(){${ga4}${metrica}a(${json(TOPSAYT_COUNTER_SRC)},d.body)}` +
    `function g(){if(s)return;s=1;clearTimeout(t);` +
    `E.forEach(function(e){w.removeEventListener(e,g,o)});L(function(){I(r)})}` +
    `E.forEach(function(e){w.addEventListener(e,g,o)});` +
    `L(function(){I(function(){s||(t=setTimeout(g,${ANALYTICS_FALLBACK_MS}))})});` +
    metricaHits +
    `})(window,document)`
  )
}
