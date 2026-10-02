import { EyeIcon } from 'lucide-react'
import Link from 'next/link'

import { getSiteStrings } from '@/i18n/site'
import { formatCompactCount } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PopularList } from '@/pageviews/popular'

import { categoryColorStyle } from './CategoryChip'
import type { Locale, PostSummary } from './types'

type PopularPostsProps = {
  locale: Locale
  /** `null` — ma'lumot yetarli emas (< 3 post), blok chizilmaydi. */
  list: PopularList<PostSummary> | null
  /** `sidebar` — bosh sahifa yon paneli (bitta ustun); `wide` — maqola oxirida (ko'p ustun). */
  variant?: 'sidebar' | 'wide'
  className?: string
}

/**
 * "Ko'p o'qilgan" (OBLOG-69): raqamlangan ro'yxat — sarlavha, kategoriya, ko'rishlar soni
 * ("1,2 ming"). Server komponent, JS yubormaydi; rasmsiz (yengil). Oyna (7/30 kun, barcha vaqt)
 * sarlavha ostida yoziladi.
 */
export function PopularPosts({ locale, list, variant = 'sidebar', className }: PopularPostsProps) {
  const t = getSiteStrings(locale)
  if (!list || list.items.length === 0) return null
  const headingId = `popular-${variant}`
  return (
    <section
      aria-labelledby={headingId}
      data-testid="popular-posts"
      data-window={list.window}
      className={cn('flex flex-col gap-3', className)}
    >
      <div className="flex flex-col gap-1">
        <h2
          id={headingId}
          className="flex items-center gap-2.5 font-display text-xl font-extrabold text-fg sm:text-2xl"
        >
          <span aria-hidden className="h-5 w-1.5 rounded-full bg-accent sm:h-6" />
          {t.mostRead}
        </h2>
        <p className="text-xs font-medium text-subtle">{t.popularWindow[list.window]}</p>
      </div>
      <ol
        className={cn(
          'flex flex-col border-t border-border',
          variant === 'wide' && 'sm:grid sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-3 xl:grid-cols-5',
        )}
      >
        {list.items.map(({ post, views }, index) => (
          <li
            key={post.id}
            className={cn('border-b border-border', variant === 'wide' && 'sm:border-b-0')}
          >
            <article className="group relative isolate grid grid-cols-[2rem_1fr] gap-3 py-3.5 has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-2 has-[[data-card-link]:focus-visible]:outline-accent">
              <span
                aria-hidden
                className="font-display text-3xl leading-none font-extrabold text-accent tabular-nums"
              >
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <h3 className="font-display text-[0.9375rem] leading-snug font-bold text-fg">
                  <Link
                    href={post.href}
                    data-card-link
                    className="line-clamp-3 after:absolute after:inset-0 after:content-[''] hover:text-accent focus-visible:outline-none"
                  >
                    {post.title}
                  </Link>
                </h3>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <Link
                    href={post.category.href}
                    style={categoryColorStyle(post.category.slug)}
                    className="relative z-10 font-semibold text-[var(--cat-fg)] hover:underline"
                  >
                    {post.category.name}
                  </Link>
                  <span className="inline-flex items-center gap-1 text-subtle tabular-nums">
                    <EyeIcon className="size-3.5" aria-hidden />
                    {formatCompactCount(views, locale)}
                    <span className="sr-only"> {t.timesRead}</span>
                  </span>
                </p>
              </div>
            </article>
          </li>
        ))}
      </ol>
    </section>
  )
}
