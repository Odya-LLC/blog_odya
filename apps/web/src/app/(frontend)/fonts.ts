import { Inter } from 'next/font/google'

/**
 * Inter 4 (brend README §5) — `next/font` build vaqtida yuklab, o'zimizda (self-hosted) beradi.
 * - `opsz` o'qi: sarlavhalarda Inter Display ko'rinishi (`font-display` utilitasi).
 * - Subset'lar: `latin` (ʻ U+02BB, ʼ U+02BC shu yerda), `cyrillic` (Ўў), `cyrillic-ext` (Ққ Ғғ Ҳҳ).
 *   Faqat shular preload qilinadi; qolgan @font-face'lar (latin-ext…) `unicode-range` bo'yicha
 *   kerak bo'lgandagina yuklanadi (TZ §8.4).
 * - `display: swap` + avtomatik fallback metrikasi — CLS ≈ 0.
 */
export const inter = Inter({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-inter',
})
