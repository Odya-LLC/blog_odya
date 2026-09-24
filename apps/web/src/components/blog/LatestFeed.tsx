import Link from 'next/link'
import { useId } from 'react'

import { getSiteStrings } from '@/i18n/site'
import { formatFeedTime } from '@/lib/format'
import { cn } from '@/lib/utils'

import { SectionHeading } from './SectionHeading'
import type { Locale, PostSummary } from './types'

type LatestFeedProps = {
  locale: Locale
  posts: PostSummary[]
  /** "Barchasi" havolasi (masalan, `/news` yoki kategoriya). */
  moreHref?: string
  title?: string
  className?: string
}

/**
 * "So'nggi yangiliklar" — xronologik lenta (kun.uz / daryo.uz uslubi): chapda vaqt, o'ngda
 * sarlavha va kategoriya. Rasmsiz — tez yuklanadi, bosh sahifa sidebar'ida yoki alohida blokda.
 */
export function LatestFeed({ locale, posts, moreHref, title, className }: LatestFeedProps) {
  const t = getSiteStrings(locale)
  const headingId = useId()
  const now = new Date()
  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-2', className)}>
      <SectionHeading
        id={headingId}
        action={moreHref ? { label: t.viewAll, href: moreHref } : undefined}
      >
        {title ?? t.latestNews}
      </SectionHeading>
      <ol className="flex flex-col">
        {posts.map((post) => (
          <li
            key={post.id}
            className="relative grid grid-cols-[4.25rem_1fr] gap-3 border-b border-border py-3 last:border-b-0"
          >
            <time
              dateTime={post.publishedAt}
              className="pt-0.5 text-sm font-semibold text-accent tabular-nums"
            >
              {formatFeedTime(post.publishedAt, locale, now)}
            </time>
            <div className="flex min-w-0 flex-col gap-1">
              <Link
                href={post.href}
                className="text-[0.9375rem] leading-snug font-semibold text-fg hover:text-accent"
              >
                {post.isBreaking ? (
                  <span className="mr-1.5 inline-block size-2 rounded-full bg-[#B91C1C] align-middle">
                    <span className="sr-only">{t.breaking}: </span>
                  </span>
                ) : null}
                {post.title}
              </Link>
              <Link
                href={post.category.href}
                className="w-fit text-xs font-medium text-subtle hover:text-fg"
              >
                {post.category.name}
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
