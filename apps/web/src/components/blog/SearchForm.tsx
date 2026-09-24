import { SearchIcon } from 'lucide-react'
import { useId } from 'react'

import { Input } from '@/components/ui/input'
import { getSiteStrings } from '@/i18n/site'
import { withLocalePrefix } from '@/lib/preferences'
import { cn } from '@/lib/utils'

import type { Locale } from './types'

type SearchFormProps = {
  locale: Locale
  defaultValue?: string
  className?: string
}

/** Qidiruv formasi — oddiy GET `/search?q=` (`/kr/search`), JS'siz ishlaydi (TZ §8.1). */
export function SearchForm({ locale, defaultValue, className }: SearchFormProps) {
  const t = getSiteStrings(locale)
  const id = useId()
  return (
    <form
      role="search"
      action={withLocalePrefix(locale, '/search')}
      method="get"
      className={cn('relative', className)}
    >
      <label className="sr-only" htmlFor={id}>
        {t.search}
      </label>
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
        aria-hidden
      />
      <Input
        id={id}
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={t.searchPlaceholder}
        autoComplete="off"
        enterKeyHint="search"
        className="rounded-full bg-surface pl-9"
      />
    </form>
  )
}
