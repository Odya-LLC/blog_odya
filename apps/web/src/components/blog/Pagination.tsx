import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { getSiteStrings } from '@/i18n/site'
import { cn } from '@/lib/utils'

import type { Locale } from './types'

type PaginationProps = {
  locale: Locale
  currentPage: number
  totalPages: number
  /** Kategoriya yo'li, masalan `/kibersport` yoki `/kr/kibersport`. 1-sahifa — shu yo'l, n — `…/page/n` (TZ §8.1). */
  basePath: string
  /** Boshqa URL sxemasi (masalan, qidiruv: `?q=…&page=n`) — berilsa `basePath` o'rniga. */
  hrefForPage?: (page: number) => string
  className?: string
}

/** URL sxemasi bo'yicha sahifa havolasi. */
export function pageHref(basePath: string, page: number): string {
  const base = basePath === '/' ? '' : basePath.replace(/\/$/, '')
  return page <= 1 ? base || '/' : `${base}/page/${page}`
}

/** 1 … 4 5 [6] 7 8 … 20 — joriy sahifa atrofida ±1 (mobil) ko'rinadi. */
export function paginationRange(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, total, current - 1, current, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const result: Array<number | 'ellipsis'> = []
  let previous = 0
  for (const page of sorted) {
    if (page - previous === 2) result.push(previous + 1)
    else if (page - previous > 2) result.push('ellipsis')
    result.push(page)
    previous = page
  }
  return result
}

/**
 * Sahifalash — oddiy havolalar (SEO uchun crawl qilinadi), joriy sahifa `aria-current="page"`.
 */
export function Pagination({
  locale,
  currentPage,
  totalPages,
  basePath,
  hrefForPage,
  className,
}: PaginationProps) {
  const t = getSiteStrings(locale)
  if (totalPages <= 1) return null
  const href = (page: number) => (hrefForPage ? hrefForPage(page) : pageHref(basePath, page))
  const hasPrevious = currentPage > 1
  const hasNext = currentPage < totalPages
  const item = cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'font-semibold tabular-nums')

  return (
    <nav aria-label={t.pagination} className={cn('flex justify-center', className)}>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {hasPrevious ? (
            <Link
              href={href(currentPage - 1)}
              rel="prev"
              className={cn(buttonVariants({ variant: 'outline' }), 'max-sm:px-3')}
            >
              <ChevronLeftIcon aria-hidden />
              <span className="max-sm:sr-only">{t.previous}</span>
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className={cn(buttonVariants({ variant: 'outline' }), 'opacity-50 max-sm:px-3')}
            >
              <ChevronLeftIcon aria-hidden />
              <span className="max-sm:sr-only">{t.previous}</span>
            </span>
          )}
        </li>
        {paginationRange(currentPage, totalPages).map((page, index) =>
          page === 'ellipsis' ? (
            <li key={`ellipsis-${index}`} aria-hidden className="px-1 text-subtle">
              …
            </li>
          ) : (
            <li key={page}>
              {page === currentPage ? (
                <span
                  aria-current="page"
                  className={cn(item, 'bg-accent text-accent-fg hover:bg-accent')}
                >
                  {page}
                </span>
              ) : (
                <Link href={href(page)} aria-label={t.page(page)} className={item}>
                  {page}
                </Link>
              )}
            </li>
          ),
        )}
        <li>
          {hasNext ? (
            <Link
              href={href(currentPage + 1)}
              rel="next"
              className={cn(buttonVariants({ variant: 'outline' }), 'max-sm:px-3')}
            >
              <span className="max-sm:sr-only">{t.next}</span>
              <ChevronRightIcon aria-hidden />
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className={cn(buttonVariants({ variant: 'outline' }), 'opacity-50 max-sm:px-3')}
            >
              <span className="max-sm:sr-only">{t.next}</span>
              <ChevronRightIcon aria-hidden />
            </span>
          )}
        </li>
      </ul>
    </nav>
  )
}
