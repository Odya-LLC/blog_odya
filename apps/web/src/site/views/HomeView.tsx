import type { Locale } from '@blog-odya/shared'
import { InboxIcon } from 'lucide-react'

import { CategoryBlock } from '@/components/blog/CategoryBlock'
import { EmptyState } from '@/components/blog/EmptyState'
import { HeroBlock } from '@/components/blog/HeroBlock'
import { LatestFeed } from '@/components/blog/LatestFeed'
import { Container } from '@/components/blog/SiteShell'
import { TelegramCTA } from '@/components/blog/TelegramCTA'
import { getSiteStrings } from '@/i18n/site'

import { getHomeData, getSiteChrome } from '../data'
import { telegramHandle } from '../mappers'
import { homePath } from '../paths'
import { SitePage } from './SitePage'

/**
 * Bosh sahifa (TZ §12.3, maket — `/styleguide/layouts/home`): hero (asosiy + 2–4 ikkinchi
 * darajali), kategoriya bloklari, "So'nggi yangiliklar" lentasi, Telegram banneri.
 */
export async function HomeView({ locale }: { locale: Locale }) {
  const t = getSiteStrings(locale)
  const [home, chrome] = await Promise.all([getHomeData(locale), getSiteChrome(locale)])
  const telegramHref = chrome.telegram[locale]
  const channelName = telegramHandle(telegramHref)

  return (
    <SitePage locale={locale} pathname={homePath(locale)}>
      <Container className="flex flex-col gap-12 py-6 lg:py-10">
        <h1 className="sr-only">
          {t.siteName} — {t.tagline}
        </h1>
        {home.main ? (
          <>
            <HeroBlock locale={locale} main={home.main} secondary={home.secondary} />
            <div className="grid gap-12 lg:grid-cols-12">
              <div className="flex flex-col gap-12 lg:col-span-8">
                {home.blocks.map((block) => (
                  <CategoryBlock
                    key={block.category.slug}
                    locale={locale}
                    category={block.category}
                    posts={block.posts}
                  />
                ))}
              </div>
              <aside className="flex flex-col gap-8 lg:col-span-4">
                <LatestFeed locale={locale} posts={home.latest} />
                <TelegramCTA
                  locale={locale}
                  href={telegramHref}
                  channelName={channelName}
                  variant="compact"
                />
              </aside>
            </div>
          </>
        ) : (
          <EmptyState icon={InboxIcon} title={t.emptyTitle} description={t.emptyCategory} />
        )}
        <TelegramCTA locale={locale} href={telegramHref} channelName={channelName} />
      </Container>
    </SitePage>
  )
}
