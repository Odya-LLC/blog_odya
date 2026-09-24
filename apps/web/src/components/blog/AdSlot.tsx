import { getSiteStrings } from '@/i18n/site'
import { cn } from '@/lib/utils'

import type { Locale } from './types'

/**
 * Reklama joylari (TZ §12.3): hozir reklama yo'q — standart holatda hech narsa chiqarmaydi.
 * O'lchamlar oldindan belgilangan, reklama yoqilganda joy rezerv qilinadi (CLS = 0).
 */
const SLOTS = {
  /** Header ostida: mobil 320×100, desktop 728×90 / 970×90. */
  'below-header': {
    size: 'mobil 320×100 · desktop 970×90',
    className: 'min-h-[100px] w-full max-w-[970px] lg:min-h-[90px]',
  },
  /** Maqola ichida: 300×250 / 336×280. */
  'in-article': {
    size: '336×280',
    className: 'min-h-[280px] w-full max-w-[336px]',
  },
  /** Sidebar (≥1024px): 300×600. */
  sidebar: {
    size: '300×600',
    className: 'min-h-[600px] w-[300px] max-lg:hidden',
  },
} as const

export type AdSlotPosition = keyof typeof SLOTS

type AdSlotProps = {
  locale: Locale
  position: AdSlotPosition
  /** Reklama yoqilganmi (kelajakda SiteSettings'dan). `false` — hech narsa render qilinmaydi. */
  enabled?: boolean
  /** Faqat /styleguide: joy va o'lchamni ko'rsatadi. */
  preview?: boolean
  className?: string
}

export function AdSlot({
  locale,
  position,
  enabled = false,
  preview = false,
  className,
}: AdSlotProps) {
  if (!enabled && !preview) return null
  const t = getSiteStrings(locale)
  const slot = SLOTS[position]
  return (
    <aside
      aria-label={t.advertisement}
      data-ad-slot={position}
      className={cn(
        'mx-auto flex flex-col items-center justify-center gap-1 rounded-md',
        slot.className,
        preview
          ? 'border border-dashed border-border bg-surface-muted text-muted'
          : 'bg-surface-muted/60',
        className,
      )}
    >
      <span className="text-[0.6875rem] font-semibold tracking-wider uppercase">
        {t.advertisement}
      </span>
      {preview ? <span className="text-xs tabular-nums">{slot.size}</span> : null}
    </aside>
  )
}
