/**
 * RSS ommaviy URL'lari → ichki route handler (`app/(seo)/feeds/[script]/[[...category]]`).
 * `next.config.ts` → `rewrites` (afterFiles: statik fayllardan keyin, dinamik `[[...path]]`
 * sahifalaridan oldin). Tartib muhim: `/kr/…` qoidalari `/:category/…` dan oldin.
 *
 * `next.config.ts` import qiladi — `@/` alias va Payload'siz, yon ta'sirsiz modul.
 */
export const FEED_REWRITES = [
  { source: '/rss.xml', destination: '/feeds/latn' },
  { source: '/kr/rss.xml', destination: '/feeds/cyrl' },
  { source: '/kr/:category/rss.xml', destination: '/feeds/cyrl/:category' },
  { source: '/:category/rss.xml', destination: '/feeds/latn/:category' },
] as const

/**
 * Trailing-slash redirect (`/x/` → `308 /x`) Payload yo'llari uchun. Qolgan yo'llarda buni
 * `src/proxy.ts` qiladi (410 tekshiruvidan keyin, OBLOG-50): `skipTrailingSlashRedirect: true`
 * Next'ning o'rnatilgan redirect'ini o'chiradi, `/api/…`, `/admin/…` esa proxy matcher'idan
 * chiqarilgan (so'rov tanasi buferlanmasin) — ular uchun avvalgi xatti-harakat shu yerda.
 */
export const TRAILING_SLASH_REDIRECTS = [
  { source: '/:root(api|admin)/', destination: '/:root', permanent: true },
  { source: '/:root(api|admin)/:path+/', destination: '/:root/:path+', permanent: true },
] as const
