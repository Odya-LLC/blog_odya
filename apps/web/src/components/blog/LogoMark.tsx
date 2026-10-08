import { cn } from '@/lib/utils'

import { BRAND_MARK } from './brand-mark'

/*
 * Brend belgisi "b" (OBLOG-96) — design/brand/logo/mark.svg. Inline SVG, rang — currentColor
 * (light/dark avtomatik). Wordmark yonida balandligi wordmark bilan bir xil (brend README §1);
 * yonida matn bo'lsa — dekorativ (`aria-hidden`), yolg'iz bo'lsa `title` bering.
 */
type LogoMarkProps = {
  className?: string
  /** Ekran o'quvchilar uchun nom — belgi yolg'iz ishlatilganda. */
  title?: string
}

export function LogoMark({ className, title }: LogoMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={BRAND_MARK.viewBox}
      width={BRAND_MARK.width}
      height={BRAND_MARK.height}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className={cn('h-7 w-auto shrink-0 text-fg', className)}
    >
      {title ? <title>{title}</title> : null}
      <path fill="currentColor" fillRule="evenodd" d={BRAND_MARK.d} />
    </svg>
  )
}
