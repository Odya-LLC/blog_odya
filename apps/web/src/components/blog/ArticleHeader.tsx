import { EyeIcon } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { getSiteStrings } from '@/i18n/site'
import { formatCompactCount, formatDate, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { showViewCount } from '@/pageviews/beacon'

import { CategoryChip } from './CategoryChip'
import { CoverImage } from './CoverImage'
import type { AuthorRef, CategoryRef, ImageRef, Locale } from './types'

type ArticleHeaderProps = {
  locale: Locale
  category: CategoryRef
  title: string
  /** Lid (`excerpt`). */
  excerpt?: string | null
  authors?: AuthorRef[]
  publishedAt: string
  updatedAt?: string | null
  readingTime?: number | null
  /**
   * Jami ko'rishlar (OBLOG-72). `undefined` — qator umuman chizilmaydi (maket); son — server
   * qiymati: `VIEW_COUNT_MIN` dan kam bo'lsa yashirin chiziladi, brauzer skripti
   * (`pageviews/beacon.ts`) yangi qiymatni yozadi va ochadi.
   */
  views?: number | null
  cover?: ImageRef | null
  /** `media.caption` / `media.credit` */
  coverCaption?: string | null
  isBreaking?: boolean
  className?: string
}

/**
 * Maqola boshi (TZ §12.3): kategoriya → sarlavha → lid → muallif, sana, o'qish vaqti, ko'rishlar
 * soni → muqova 16:9.
 * Matn kengligi ≤ 680 px, muqova esa biroz kengroq (≤ 880 px) — The Verge/Habr uslubi.
 */
export function ArticleHeader({
  locale,
  category,
  title,
  excerpt,
  authors = [],
  publishedAt,
  updatedAt,
  readingTime,
  views,
  cover,
  coverCaption,
  isBreaking,
  className,
}: ArticleHeaderProps) {
  const t = getSiteStrings(locale)
  const showUpdated = updatedAt && updatedAt.slice(0, 16) !== publishedAt.slice(0, 16)
  return (
    <header className={cn('flex flex-col gap-6', className)}>
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {isBreaking ? <Badge variant="breaking">{t.breaking}</Badge> : null}
          <CategoryChip category={category} size="md" />
        </div>
        <h1 className="font-display text-[1.875rem] leading-[1.1] font-extrabold text-balance text-fg sm:text-[2.625rem]">
          {title}
        </h1>
        {excerpt ? (
          <p className="text-lg leading-relaxed text-muted sm:text-xl">{excerpt}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-border py-3 text-sm">
          {authors.length > 0 ? (
            <p className="flex items-center gap-2 font-semibold text-fg">
              <span className="sr-only">{t.by}:</span>
              {authors.map((author, index) => (
                <span key={author.name}>
                  {author.href ? (
                    <Link href={author.href} className="hover:text-accent">
                      {author.name}
                    </Link>
                  ) : (
                    author.name
                  )}
                  {index < authors.length - 1 ? ', ' : null}
                </span>
              ))}
            </p>
          ) : null}
          <p className="text-subtle">
            <span className="sr-only">{t.publishedLabel}: </span>
            <time dateTime={publishedAt}>
              {formatDate(publishedAt, locale)}, {formatTime(publishedAt, locale)}
            </time>
          </p>
          {showUpdated ? (
            <p className="text-subtle">
              {t.updatedLabel}:{' '}
              <time dateTime={updatedAt}>
                {formatDate(updatedAt, locale)}, {formatTime(updatedAt, locale)}
              </time>
            </p>
          ) : null}
          {readingTime ? (
            <p className="text-subtle">
              <span className="sr-only">{t.readingTimeLabel}: </span>
              {t.readingTime(readingTime)}
            </p>
          ) : null}
          {views !== undefined ? (
            // Skript (hydration'dan oldin ham bo'lishi mumkin) `hidden`, `data-views` va raqamni
            // yangilaydi — farq kutilgan (`suppressHydrationWarning`).
            <p
              data-views={views ?? 0}
              data-testid="article-views"
              hidden={!showViewCount(views)}
              suppressHydrationWarning
              className="inline-flex items-center gap-1 text-subtle tabular-nums"
            >
              <EyeIcon className="size-4" aria-hidden />
              <span data-views-n="" suppressHydrationWarning>
                {formatCompactCount(views ?? 0, locale)}
              </span>{' '}
              {/* Bo'shliq — matn va ekran o'quvchi uchun ("1,2 ming marta…"); flex'da ko'rinmaydi. */}
              <span>{t.readCount}</span>
            </p>
          ) : null}
        </div>
      </div>
      <figure className="mx-auto flex w-full max-w-[880px] flex-col gap-2">
        <CoverImage
          image={cover}
          category={category}
          aspect="16/9"
          sizes="(min-width: 920px) 880px, 100vw"
          priority
          noImageLabel={t.noImage}
          className="rounded-none sm:rounded-lg max-sm:-mx-4"
        />
        {coverCaption ? (
          <figcaption className="text-xs text-subtle">{coverCaption}</figcaption>
        ) : null}
      </figure>
    </header>
  )
}
