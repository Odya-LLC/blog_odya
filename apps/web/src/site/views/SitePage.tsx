import type { Locale } from '@blog-odya/shared'
import type { ReactNode } from 'react'

import { SiteShell } from '@/components/blog/SiteShell'

import { getSiteChrome } from '../data'
import { alternatePaths } from '../paths'

type SitePageProps = {
  locale: Locale
  /** Joriy sahifa yo'li (joriy yozuv prefiksi bilan) — almashtirgich boshqa yozuvdagi URL'ni shundan oladi. */
  pathname: string
  /** Faol menyu bandi: kategoriya (yoki menyudagi statik sahifa) slug'i. */
  activeCategorySlug?: string
  children: ReactNode
}

/**
 * Sahifa karkasi (header, footer) Payload ma'lumotlari bilan: `header` global'idagi menyu
 * (bo'sh bo'lsa — kategoriyalar), `footer` global'idagi ustunlar va mualliflik qatori, joriy
 * yozuvdagi Telegram kanal va "Lotin / Кирилл" almashtirgichi.
 */
export async function SitePage({ locale, pathname, activeCategorySlug, children }: SitePageProps) {
  const chrome = await getSiteChrome(locale)
  return (
    <SiteShell
      locale={locale}
      header={{
        categories: chrome.categories,
        alternateHrefs: alternatePaths(pathname),
        telegramHref: chrome.telegram[locale],
        activeCategorySlug,
      }}
      footer={{
        categories: chrome.categories,
        legalLinks: chrome.legalLinks,
        columns: chrome.footerColumns,
        copyright: chrome.copyright,
        telegram: chrome.telegram,
      }}
    >
      {children}
    </SiteShell>
  )
}
