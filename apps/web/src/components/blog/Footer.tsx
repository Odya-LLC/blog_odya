import Link from 'next/link'

import { getSiteStrings } from '@/i18n/site'
import { withLocalePrefix } from '@/lib/preferences'
import { cn } from '@/lib/utils'

import { newTabProps } from './Header'
import { TelegramIcon } from './icons'
import type { FooterColumn, LinkItem, Locale, NavCategory, TelegramLinks } from './types'
import { Wordmark } from './Wordmark'

type FooterProps = {
  locale: Locale
  categories: NavCategory[]
  /** Huquqiy/ma'lumot sahifalari: "Biz haqimizda", "Tahririyat siyosati", aloqa… (TZ §8.3 E-E-A-T). */
  legalLinks: LinkItem[]
  /**
   * `footer` global'idagi ustunlar (TZ §10.15). Berilsa — kategoriyalar/huquqiy ustunlar o'rniga
   * shular chiziladi; bo'sh bo'lsa — standart ikki ustun (`categories` + `legalLinks`).
   */
  columns?: FooterColumn[]
  /** `footer.copyright` (masalan, "© Odya LLC") — yil qo'shiladi. */
  copyright?: string | null
  /** Ikkala Telegram kanal (TZ §12.3). */
  telegram: TelegramLinks
  year?: number
  className?: string
}

const linkClass = 'text-sm text-muted transition-colors hover:text-fg'

/** Ko'p havolali ustun (kategoriyalar) mobilda ikki ustunda. */
const MANY_LINKS = 6

/** "© Odya LLC" → "© 2026 Odya LLC". */
export function copyrightLine(copyright: string | null | undefined, year: number): string {
  const text = copyright?.trim() || '© Odya LLC'
  return /^©/.test(text) ? text.replace(/^©\s*/, `© ${year} `) : `© ${year} ${text}`
}

/** Footer (TZ §12.3): menyu ustunlari (`footer` global'i), ikkala Telegram kanal, "© Odya LLC". */
export function Footer({
  locale,
  categories,
  legalLinks,
  columns,
  copyright,
  telegram,
  year = new Date().getFullYear(),
  className,
}: FooterProps) {
  const t = getSiteStrings(locale)
  const menuColumns: FooterColumn[] =
    columns && columns.length > 0
      ? columns
      : [
          {
            title: t.categoriesNav,
            links: categories.map((category) => ({ label: category.name, href: category.href })),
          },
          { title: t.footerLegal, links: legalLinks },
        ]
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

        {menuColumns.map((column, index) => {
          const headingId = `footer-column-${index}`
          const many = column.links.length > MANY_LINKS
          return (
            <nav
              key={headingId}
              aria-labelledby={column.title ? headingId : undefined}
              aria-label={column.title ? undefined : t.footerLegal}
              className={cn('flex flex-col gap-3', index === 0 ? 'lg:col-span-3' : 'lg:col-span-2')}
            >
              {column.title ? (
                <h2 id={headingId} className="text-sm font-bold text-fg">
                  {column.title}
                </h2>
              ) : null}
              <ul
                className={cn(
                  many ? 'grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-1' : 'flex flex-col gap-2',
                )}
              >
                {column.links.map((link) => (
                  <li key={`${link.href}-${link.label}`}>
                    <Link href={link.href} className={linkClass} {...newTabProps(link.newTab)}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )
        })}

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
          {copyrightLine(copyright, year)}. {t.rights}
        </p>
      </div>
    </footer>
  )
}
