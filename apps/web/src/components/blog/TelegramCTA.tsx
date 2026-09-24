import { buttonVariants } from '@/components/ui/button'
import { getSiteStrings } from '@/i18n/site'
import { cn } from '@/lib/utils'

import { TelegramIcon } from './icons'
import type { Locale } from './types'

type TelegramCTAProps = {
  locale: Locale
  /** Joriy yozuvdagi kanal (lotin → lotin kanal, kirill → kirill kanal — TZ §7.1). */
  href: string
  /** Kanal nomi, masalan `@blogodya`. */
  channelName?: string
  variant?: 'banner' | 'compact'
  className?: string
}

/**
 * Telegram obuna banneri (bosh sahifa, maqola oxiri). Fon — aksent yumshoq tonida,
 * tugma — Telegram ko'ki (oq matn 5.01:1).
 */
export function TelegramCTA({
  locale,
  href,
  channelName,
  variant = 'banner',
  className,
}: TelegramCTAProps) {
  const t = getSiteStrings(locale)

  if (variant === 'compact') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex items-center gap-3 rounded-md border border-border bg-surface p-3 transition-colors hover:border-telegram',
          className,
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-telegram text-white">
          <TelegramIcon className="size-5" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-fg">{t.telegramCtaTitle}</span>
          {channelName ? <span className="text-xs text-subtle">{channelName}</span> : null}
        </span>
      </a>
    )
  }

  return (
    <section
      aria-label={t.telegramChannel}
      className={cn(
        'relative isolate overflow-hidden rounded-lg bg-accent-soft p-6 sm:p-8',
        className,
      )}
    >
      <TelegramIcon
        className="absolute -top-8 -right-8 -z-10 size-44 text-accent opacity-10 sm:size-56"
        aria-hidden
      />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex max-w-xl flex-col gap-2">
          <p className="font-display text-xl font-extrabold text-fg sm:text-2xl">
            {t.telegramCtaTitle}
          </p>
          <p className="text-sm text-muted sm:text-base">{t.telegramCtaText}</p>
          {channelName ? (
            <p className="text-sm font-semibold text-accent-soft-fg">{channelName}</p>
          ) : null}
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'telegram', size: 'lg' }), 'rounded-full')}
        >
          <TelegramIcon />
          {t.telegramCtaButton}
        </a>
      </div>
    </section>
  )
}
