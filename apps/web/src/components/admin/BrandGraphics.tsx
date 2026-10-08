import { BRAND_MARK } from '@/components/blog/brand-mark'
import { WORDMARKS } from '@/components/blog/Wordmark'

import './brand.css'

/*
 * Admin panel grafikasi (OBLOG-96): Payload `admin.components.graphics`.
 * - `AdminLogo` — login/parol tiklash sahifalarida: "b" belgisi + "Blog Odya" wordmark'i.
 * - `AdminIcon` — navigatsiya tepasidagi kichik belgi.
 * Ranglar Payload temasidan (`--theme-text`); wordmark aksenti light/dark bo'yicha (brand.css).
 */

function Mark({ className }: { className: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={BRAND_MARK.viewBox}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path fill="currentColor" fillRule="evenodd" d={BRAND_MARK.d} />
    </svg>
  )
}

export function AdminLogo() {
  const wordmark = WORDMARKS['uz-Latn']
  return (
    <div className="brand-logo" role="img" aria-label={wordmark.label}>
      <Mark className="brand-logo__mark" />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={wordmark.viewBox}
        className="brand-logo__wordmark"
        aria-hidden="true"
        focusable="false"
      >
        <path fill="currentColor" d={wordmark.first} />
        <path className="brand-logo__accent" d={wordmark.second} />
      </svg>
    </div>
  )
}

export function AdminIcon() {
  return <Mark className="brand-icon" />
}
