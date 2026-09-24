import Link from 'next/link'

import { getSiteStrings } from '@/i18n/site'
import { cn } from '@/lib/utils'

import type { Locale, TagRef } from './types'

type TagListProps = {
  locale: Locale
  tags: TagRef[]
  /** Ko'rinadigan "Teglar:" sarlavhasi. */
  showLabel?: boolean
  className?: string
}

/** Teglar ro'yxati (CS2, ChatGPT, iPhone…) — `#` prefiksli chip'lar. */
export function TagList({ locale, tags, showLabel = true, className }: TagListProps) {
  const t = getSiteStrings(locale)
  if (tags.length === 0) return null
  return (
    <nav aria-label={t.tags} className={cn('flex flex-wrap items-center gap-2', className)}>
      {showLabel ? <span className="mr-1 text-sm font-semibold text-fg">{t.tags}:</span> : null}
      <ul className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <li key={tag.slug}>
            <Link
              href={tag.href}
              className="inline-flex h-8 items-center rounded-full border border-border px-3 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <span aria-hidden className="mr-0.5 text-subtle">
                #
              </span>
              {tag.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
