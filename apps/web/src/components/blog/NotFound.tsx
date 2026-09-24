import { ArrowLeftIcon } from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { getSiteStrings } from '@/i18n/site'
import { withLocalePrefix } from '@/lib/preferences'
import { cn } from '@/lib/utils'

import { SearchForm } from './SearchForm'
import type { Locale } from './types'

type NotFoundProps = {
  locale: Locale
  className?: string
}

/** 404 sahifa mazmuni (TZ §12.3): katta "404", izoh, qidiruv va bosh sahifaga havola. */
export function NotFound({ locale, className }: NotFoundProps) {
  const t = getSiteStrings(locale)
  return (
    <section
      aria-labelledby="not-found-title"
      className={cn(
        'mx-auto flex max-w-xl flex-col items-center gap-5 py-16 text-center',
        className,
      )}
    >
      <p
        aria-hidden
        className="font-display text-[6rem] leading-none font-extrabold text-accent sm:text-[8rem]"
      >
        404
      </p>
      <h1 id="not-found-title" className="font-display text-3xl font-extrabold text-fg">
        {t.notFoundTitle}
      </h1>
      <p className="text-muted">{t.notFoundText}</p>
      <SearchForm locale={locale} className="w-full max-w-sm" />
      <Link href={withLocalePrefix(locale, '/')} className={cn(buttonVariants(), 'rounded-full')}>
        <ArrowLeftIcon aria-hidden />
        {t.backHome}
      </Link>
    </section>
  )
}
