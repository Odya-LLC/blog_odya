import { buttonVariants } from '@/components/ui/button'
import { getSiteStrings } from '@/i18n/site'
import { cn } from '@/lib/utils'

import { CopyLinkButton } from './CopyLinkButton'
import { FacebookIcon, TelegramIcon, XIcon } from './icons'
import type { Locale } from './types'

type ShareButtonsProps = {
  locale: Locale
  /** Maqolaning to'liq (absolyut) URL'i. */
  url: string
  title: string
  className?: string
}

/**
 * Ulashish tugmalari — Telegram birinchi va ajralib turadi (TZ §12.3). Oddiy havolalar (JS'siz),
 * faqat "Havolani nusxalash" — kichik client orol.
 */
export function ShareButtons({ locale, url, title, className }: ShareButtonsProps) {
  const t = getSiteStrings(locale)
  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)
  const iconButton = cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'rounded-full')

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="mr-1 text-sm font-semibold text-fg">{t.share}:</span>
      <a
        href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: 'telegram' }), 'rounded-full')}
      >
        <TelegramIcon />
        {t.telegram}
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t.shareOn('Facebook')}
        title="Facebook"
        className={iconButton}
      >
        <FacebookIcon />
      </a>
      <a
        href={`https://x.com/intent/post?url=${encodedUrl}&text=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t.shareOn('X')}
        title="X"
        className={iconButton}
      >
        <XIcon />
      </a>
      <CopyLinkButton
        url={url}
        label={t.copyLink}
        copiedLabel={t.linkCopied}
        className={iconButton}
      />
    </div>
  )
}
