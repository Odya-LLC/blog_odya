/**
 * Ko'rish "mayoq"i (OBLOG-69) — root layout'dagi inline skript (yangi JS chunk yo'q, JS byudjeti
 * ≤ 150 KB; CSP `script-src 'unsafe-inline'`, `connect-src 'self'`).
 *
 * Har soniyada sahifadagi `[data-pv]` (maqola elementi, qiymati — post ID) tekshiriladi: post
 * sahifasi tab ko'rinib turgan holda jami `VIEW_BEACON_DELAY_SECONDS` soniya ochiq tursa —
 * `navigator.sendBeacon('/api/views', id)`. Bir sahifa yuklanishida har post bir marta.
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

export const viewBeaconScript =
  `(function(){var w=window,d=document;if(w.__bopv||!navigator.sendBeacon)return;w.__bopv=1;` +
  `var c=null,n=0,s={};setInterval(function(){var e=d.querySelector('[data-pv]'),` +
  `v=e&&e.getAttribute('data-pv');if(v!==c){c=v;n=0}if(!v||s[v]||d.hidden)return;` +
  `if(++n>=${VIEW_BEACON_DELAY_SECONDS}){s[v]=1;navigator.sendBeacon('${VIEW_BEACON_ENDPOINT}',v)}},1e3)})()`
