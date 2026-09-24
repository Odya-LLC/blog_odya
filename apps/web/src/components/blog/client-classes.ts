/**
 * Client komponentlar (`'use client'`) uchun sinflar — `tailwind-merge` va `cva` siz.
 *
 * `cn()` (clsx + tailwind-merge) va `buttonVariants` (cva) server komponentlarda qoladi; client
 * orollarida ular birinchi yuklash JS'iga ~10 KB gzip qo'shadi (TZ §8.4 byudjeti ≤ 150 KB, M1-07).
 * Bu yerdagi satrlar to'qnashuvsiz yozilgan, shuning uchun birlashtirish (merge) kerak emas.
 */

/** `buttonVariants({ variant: 'ghost', size: 'icon' })` + `rounded-full` — header ikon tugmalari. */
export const ICON_BUTTON_CLASS =
  'inline-flex size-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold text-fg transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0'

/** Shartli sinflar (clsx kabi, kichik): falsy qiymatlar tashlanadi. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}
