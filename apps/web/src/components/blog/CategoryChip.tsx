import Link from 'next/link'
import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'

import type { CategoryRef } from './types'

/**
 * Kategoriya rang o'zgaruvchilari (tokens.css: `--cat-<slug>-bg|fg|solid`). Noma'lum slug —
 * neytral/aksent zaxira. Dark rejimda tokens.css qiymatlarni o'zi almashtiradi.
 */
export function categoryColorStyle(slug: string): CSSProperties {
  return {
    '--cat-bg': `var(--cat-${slug}-bg, var(--color-accent-soft))`,
    '--cat-fg': `var(--cat-${slug}-fg, var(--color-accent-soft-fg))`,
    '--cat-solid': `var(--cat-${slug}-solid, #3f3f46)`,
  } as CSSProperties
}

type CategoryChipProps = {
  category: CategoryRef
  size?: 'sm' | 'md'
  /** `false` — havolasiz (masalan, kartochka ichida bo'lmagan joyda). */
  asLink?: boolean
  className?: string
}

/** Kategoriya belgisi — yumshoq fon + kategoriya matn rangi (AA: brend README §7). */
export function CategoryChip({
  category,
  size = 'sm',
  asLink = true,
  className,
}: CategoryChipProps) {
  const classes = cn(
    'relative z-10 inline-flex w-fit items-center rounded-full bg-[var(--cat-bg)] font-semibold text-[var(--cat-fg)] transition-opacity',
    size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
    asLink && 'hover:opacity-85',
    className,
  )
  const style = categoryColorStyle(category.slug)

  if (!asLink) {
    return (
      <span className={classes} style={style}>
        {category.name}
      </span>
    )
  }
  return (
    <Link href={category.href} className={classes} style={style}>
      {category.name}
    </Link>
  )
}
