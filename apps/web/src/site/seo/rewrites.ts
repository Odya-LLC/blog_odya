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
