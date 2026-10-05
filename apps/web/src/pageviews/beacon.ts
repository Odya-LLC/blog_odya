import { COMPACT_UNITS } from '@/lib/format'

/**
 * Ko'rish "mayoq"i (OBLOG-69) va maqoladagi ko'rishlar soni (OBLOG-72) — root layout'dagi bitta
 * inline skript (yangi JS chunk yo'q, JS byudjeti ≤ 150 KB; CSP `script-src 'unsafe-inline'`,
 * `connect-src 'self'`).
 *
 * Har soniyada sahifadagi `[data-pv]` (maqola elementi, qiymati — post ID) tekshiriladi:
 * - post sahifasi tab ko'rinib turgan holda jami `VIEW_BEACON_DELAY_SECONDS` soniya ochiq tursa —
 *   `navigator.sendBeacon('/api/views', id)`. Bir sahifa yuklanishida har post bir marta;
 * - yangi post aniqlanganda (birinchi tekshiruvda yoki client navigatsiyada) — bir marta
 *   `GET /api/views?id=` (CDN keshi, `VIEW_COUNT_CACHE_CONTROL`) va javobdagi jami ko'rishlar
 *   maqola meta qatoridagi `[data-views]` ga yoziladi (`ArticleHeader`). Server allaqachon ISR
 *   bilan (≤ 30 daqiqa eski) qiymat chizgan — skript faqat kattaroq va `VIEW_COUNT_MIN` dan kam
 *   bo'lmagan qiymatni yozadi (joy oldindan band — CLS yo'q).
 * Client navigatsiya (Link) ham qamraladi: skript layout bilan bir marta ishga tushadi, React
 * keyin chizgan inline skriptlarni bajarmaydi — shuning uchun maqolaning o'zida emas.
 * Bounce'lar (darhol yopilgan tab), fon tablari va prefetch hisoblanmaydi. Lotin va kirill
 * sahifalari — bitta post, bitta hisob.
 *
 * DNT (`navigator.doNotTrack`) hisobga olinmaydi: shaxsiy ma'lumot yig'ilmaydi, faqat anonim
 * agregat (maxfiylik siyosatida yozilgan).
 */
export const VIEW_BEACON_DELAY_SECONDS = 5

export const VIEW_BEACON_ENDPOINT = '/api/views'

/**
 * Maqolada ko'rishlar soni shundan boshlab ko'rsatiladi: "3 marta oʻqildi" kabi kichik raqamlar
 * yangi maqolani zaif ko'rsatadi va ma'lumot bermaydi.
 */
export const VIEW_COUNT_MIN = 10

/** `GET /api/views?id=` — CDN 5 daqiqa saqlaydi, keyin 10 daqiqa eski javob + fon yangilash. */
export const VIEW_COUNT_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600'

/** Maqolada ko'rishlar soni ko'rsatiladimi (server va skript bir xil qoida). */
export function showViewCount(views: number | null | undefined): views is number {
  return typeof views === 'number' && views >= VIEW_COUNT_MIN
}

const unitsJs = (locale: keyof typeof COMPACT_UNITS) =>
  JSON.stringify([COMPACT_UNITS[locale].thousand, COMPACT_UNITS[locale].million])

/**
 * `formatCompactCount` ning skriptdagi nusxasi (`f(x)`; yozuv — `<html lang>` dan). Bir xilligi
 * unit testda tekshiriladi.
 */
export const viewCountFormatterSource =
  `function f(x){var u=x<1e6?1e3:1e6,t=Math.floor(x/(u/10));return x<1e3?''+x:` +
  `(t>=100?''+Math.floor(t/10):t%10?Math.floor(t/10)+','+t%10:''+t/10)+' '+` +
  `(d.documentElement.lang=='uz-Cyrl'?${unitsJs('uz-Cyrl')}:${unitsJs('uz-Latn')})[u>1e3?1:0]}`

export const viewBeaconScript =
  `(function(){var w=window,d=document;if(w.__bopv)return;w.__bopv=1;` +
  `var c=null,n=0,s={},E='${VIEW_BEACON_ENDPOINT}',b=navigator.sendBeacon;${viewCountFormatterSource}` +
  `function g(v){w.fetch&&w.fetch(E+'?id='+v).then(function(r){return r.ok&&r.json()})` +
  `.then(function(j){var e=d.querySelector('[data-pv="'+v+'"] [data-views]'),x=j&&j.views;` +
  `if(e&&x>=${VIEW_COUNT_MIN}&&x>+e.getAttribute('data-views')){e.setAttribute('data-views',x);` +
  `e.querySelector('[data-views-n]').textContent=f(x);e.hidden=!1}}).catch(function(){})}` +
  `setInterval(function(){var e=d.querySelector('[data-pv]'),` +
  `v=e&&e.getAttribute('data-pv');if(v!==c){c=v;n=0;v&&g(v)}if(!b||!v||s[v]||d.hidden)return;` +
  `if(++n>=${VIEW_BEACON_DELAY_SECONDS}){s[v]=1;navigator.sendBeacon(E,v)}},1e3)})()`
