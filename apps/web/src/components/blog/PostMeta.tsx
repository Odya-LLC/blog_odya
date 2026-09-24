import { ClockIcon } from 'lucide-react'

import { getSiteStrings } from '@/i18n/site'
import { formatDate, formatFeedTime } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { Locale } from './types'

type PostMetaProps = {
  locale: Locale
  publishedAt: string
  readingTime?: number | null
  /** `feed` — lenta uchun ("14:05" yoki "24-sen, 14:05"), `full` — "24-sentabr, 2026". */
  dateStyle?: 'feed' | 'full'
  className?: string
}

/** Sana + o'qish vaqti. `textSubtle` — faqat bg/surface ustida (AA, brend README §7). */
export function PostMeta({
  locale,
  publishedAt,
  readingTime,
  dateStyle = 'feed',
  className,
}: PostMetaProps) {
  const t = getSiteStrings(locale)
  const label =
    dateStyle === 'full' ? formatDate(publishedAt, locale) : formatFeedTime(publishedAt, locale)
  return (
    <p className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle', className)}>
      <time dateTime={publishedAt} suppressHydrationWarning>
        {label}
      </time>
      {readingTime ? (
        <span className="inline-flex items-center gap-1">
          <ClockIcon className="size-3.5" aria-hidden />
          <span className="sr-only">{t.readingTimeLabel}: </span>
          {t.readingTime(readingTime)}
        </span>
      ) : null}
    </p>
  )
}
