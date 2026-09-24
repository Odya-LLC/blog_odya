import Link from 'next/link'

import { getSiteStrings } from '@/i18n/site'
import { withLocalePrefix } from '@/lib/preferences'
import { cn } from '@/lib/utils'

import { TelegramIcon } from './icons'
import type { LinkItem, Locale, NavCategory, TelegramLinks } from './types'
import { Wordmark } from './Wordmark'

type FooterProps = {
  locale: Locale
  categories: NavCategory[]
  /** Huquqiy/ma'lumot sahifalari: "Biz haqimizda", "Tahririyat siyosati", aloqa… (TZ §8.3 E-E-A-T). */
  legalLinks: LinkItem[]
  /** Ikkala Telegram kanal (TZ §12.3). */
  telegram: TelegramLinks
  year?: number
  className?: string
}

const linkClass = 'text-sm text-muted transition-colors hover:text-fg'

/** Footer (TZ §12.3): kategoriyalar, huquqiy sahifalar, ikkala Telegram kanal, "© Odya LLC". */
export function Footer({
  locale,
  categories,
  legalLinks,
  telegram,
  year = new Date().getFullYear(),
  className,
}: FooterProps) {
  const t = getSiteStrings(locale)
  return (
    <footer className={cn('border-t border-border bg-surface', className)}>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:grid-cols-2 lg:grid-cols-12 lg:px-6 lg:py-14">
        <div className="flex flex-col gap-4 lg:col-span-4">
          <Link
            href={withLocalePrefix(locale, '/')}
            aria-label={`${t.siteName} — ${t.home}`}
            className="w-fit rounded-sm"
          >
            <Wordmark locale={locale} className="h-6" />
          </Link>
          <p className="max-w-xs text-sm text-muted">{t.footerAbout}</p>
        </div>

        <nav aria-labelledby="footer-categories" className="flex flex-col gap-3 lg:col-span-3">
          <h2 id="footer-categories" className="text-sm font-bold text-fg">
            {t.categoriesNav}
          </h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-1">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link href={category.href} className={linkClass}>
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-legal" className="flex flex-col gap-3 lg:col-span-2">
          <h2 id="footer-legal" className="text-sm font-bold text-fg">
            {t.footerLegal}
          </h2>
          <ul className="flex flex-col gap-2">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={linkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-3 lg:col-span-3">
          <h2 className="text-sm font-bold text-fg">{t.footerTelegram}</h2>
          <ul className="flex flex-col gap-2">
            <li>
              <a
                href={telegram['uz-Latn']}
                target="_blank"
                rel="noopener noreferrer"
                lang="uz-Latn"
                className={cn(linkClass, 'inline-flex items-center gap-2')}
              >
                <TelegramIcon className="size-4 text-telegram dark:text-accent" />
                Blog Odya — Lotin
              </a>
            </li>
            <li>
              <a
                href={telegram['uz-Cyrl']}
                target="_blank"
                rel="noopener noreferrer"
                lang="uz-Cyrl"
                className={cn(linkClass, 'inline-flex items-center gap-2')}
              >
                <TelegramIcon className="size-4 text-telegram dark:text-accent" />
                Блог Одя — Кирилл
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-subtle lg:px-6">
          © {year} Odya LLC. {t.rights}
        </p>
      </div>
    </footer>
  )
}
