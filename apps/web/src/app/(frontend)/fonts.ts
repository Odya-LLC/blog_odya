import { Inter } from 'next/font/google'

/**
 * Inter 4 (brend README §5) — `next/font` build vaqtida yuklab, o'zimizda (self-hosted) beradi.
 * - `opsz` o'qi: sarlavhalarda Inter Display ko'rinishi (`font-display` utilitasi).
 * - `subsets` — faqat **preload** qilinadiganlar: `latin` (ʻ U+02BB, ʼ U+02BC shu yerda; kirill
 *   sahifalarda ham lotin matn bor). Kirill (`cyrillic` — Ўў, `cyrillic-ext` — Ққ Ғғ Ҳҳ) va
 *   boshqa @font-face'lar CSS'da qoladi va `unicode-range` bo'yicha kerak bo'lganda yuklanadi.
 *   Uchala subset'ni preload qilish (~140 KB) mobil LCP rasmi bilan tarmoq uchun raqobatlashardi
 *   (Lighthouse CI, TZ §8.4 — M1-07).
 * - `display: swap` + avtomatik fallback metrikasi — CLS ≈ 0.
 */
export const inter = Inter({
  subsets: ['latin'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-inter',
})
