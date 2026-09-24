/**
 * `/styleguide` faqat lokal dev va Vercel preview'da ochiladi (M1-04). Production'da — 404.
 * Istisno: `ENABLE_STYLEGUIDE=1` (masalan, staging'da ko'rsatish uchun).
 */
export function isStyleguideEnabled(source: Record<string, string | undefined> = process.env) {
  if (source.ENABLE_STYLEGUIDE === '1' || source.ENABLE_STYLEGUIDE === 'true') return true
  if (source.VERCEL_ENV === 'preview' || source.VERCEL_ENV === 'development') return true
  if (source.VERCEL_ENV === 'production') return false
  return source.NODE_ENV !== 'production'
}
