import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { getSiteStrings } from '@/i18n/site'
import { withLocalePrefix } from '@/lib/preferences'
import { cn } from '@/lib/utils'

import { HeaderMobileMenu } from './HeaderMobileMenu'
import { HeaderMoreMenu } from './HeaderMoreMenu'
import { TelegramIcon } from './icons'
import { newTabProps } from './link-props'
import { ScriptSwitcher } from './ScriptSwitcher'
import { SearchForm } from './SearchForm'
import { ThemeToggle } from './ThemeToggle'
import type { Locale, NavCategory } from './types'
import { Wordmark } from './Wordmark'

type HeaderProps = {
  locale: Locale
  /** `order` bo'yicha tartiblangan; `isInMenu: false` — "Yana" ichida. */
  categories: NavCategory[]
  /** Joriy sahifaning ikkala yozuvdagi URL'i (almashtirgich uchun). */
  alternateHrefs: Record<Locale, string>
  /** Joriy yozuvdagi Telegram kanal. */
  telegramHref: string
  /** Faol kategoriya (kategoriya/maqola sahifasida). */
  activeCategorySlug?: string
  className?: string
}

/**
 * Sayt header'i (TZ §12.3). Server komponent; client orollar faqat: yozuv almashtirgich,
 * tema tugmasi, mobil menyu, "Yana" menyusi.
 *
 * 1-qator: wordmark · qidiruv (≥1024) · Lotin/Кирилл · tema · Telegram (≥640) · burger (<1024).
 * 2-qator: kategoriyalar — mobilda gorizontal scroll, desktop'da to'liq + "Yana".
 */
export function Header({
  locale,
  categories,
  alternateHrefs,
  telegramHref,
  activeCategorySlug,
  className,
}: HeaderProps) {
  const t = getSiteStrings(locale)
  const menuCategories = categories.filter((category) => category.isInMenu)
  const moreCategories = categories.filter((category) => !category.isInMenu)

  return (
    <header className={cn('border-b border-border bg-bg', className)}>
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3 lg:h-16 lg:px-6">
        <Link
          href={withLocalePrefix(locale, '/')}
          aria-label={`${t.siteName} — ${t.home}`}
          className="shrink-0 rounded-sm py-1"
        >
          <Wordmark locale={locale} className="h-[22px] sm:h-6 lg:h-7" />
        </Link>

        <SearchForm locale={locale} className="ml-auto hidden w-full max-w-xs lg:block" />

        <div className="ml-auto flex items-center gap-1 sm:gap-2 lg:ml-0">
          <ScriptSwitcher locale={locale} hrefs={alternateHrefs} label={t.scriptSwitcher} />
          <ThemeToggle label={t.themeToggle} />
          <a
            href={telegramHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: 'telegram', size: 'sm' }),
              'hidden rounded-full sm:inline-flex',
            )}
          >
            <TelegramIcon />
            {t.telegram}
          </a>
          <HeaderMobileMenu
            openLabel={t.openMenu}
            closeLabel={t.closeMenu}
            title={t.menu}
            className="lg:hidden"
          >
            <SearchForm locale={locale} />
            <nav aria-label={t.categoriesNav}>
              <ul className="flex flex-col">
                {categories.map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={category.href}
                      {...newTabProps(category.newTab)}
                      aria-current={category.slug === activeCategorySlug ? 'page' : undefined}
                      className="flex h-11 items-center border-b border-border text-base font-semibold text-fg hover:text-accent aria-[current=page]:text-accent"
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <a
              href={telegramHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'telegram' }), 'rounded-full')}
            >
              <TelegramIcon />
              {t.telegramChannel}
            </a>
          </HeaderMobileMenu>
        </div>
      </div>

      <nav aria-label={t.categoriesNav} className="border-t border-border">
        <div className="mx-auto flex max-w-7xl items-center px-4 lg:px-6">
          <ul className="scrollbar-none -mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 py-1.5 lg:gap-0.5">
            {menuCategories.map((category) => {
              const active = category.slug === activeCategorySlug
              return (
                <li key={category.slug} className="shrink-0">
                  <Link
                    href={category.href}
                    {...newTabProps(category.newTab)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors',
                      active
                        ? 'bg-accent-soft text-accent-soft-fg'
                        : 'text-muted hover:bg-surface-muted hover:text-fg',
                    )}
                  >
                    {category.name}
                  </Link>
                </li>
              )
            })}
          </ul>
          <HeaderMoreMenu
            label={t.more}
            className="ml-1 shrink-0"
            items={moreCategories.map((category) => ({
              label: category.name,
              href: category.href,
              newTab: category.newTab,
              active: category.slug === activeCategorySlug,
            }))}
          />
        </div>
      </nav>
    </header>
  )
}
