import type { Locale } from '@blog-odya/shared'
import { ChevronRightIcon, InboxIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/blog/EmptyState'
import {
  CategorySection,
  LeadBlock,
  NewsFeed,
  TopicList,
  TrendingTags,
} from '@/components/blog/HomeBlocks'
import { Container } from '@/components/blog/SiteShell'
import { TelegramCTA } from '@/components/blog/TelegramCTA'
import { getSiteStrings } from '@/i18n/site'
import { cn } from '@/lib/utils'

import { getCategoryTopics, getHomeData, getSiteChrome } from '../data'
import { groupSectionRows } from '../home'
import { telegramHandle } from '../mappers'
import { archivePath, homePath } from '../paths'
import { getSiteSeo } from '../seo/data'
import { JsonLd } from '../seo/JsonLd'
import { homeSeo } from '../seo/pages'
import { SitePage } from './SitePage'

/** SEO (TZ §8.2): canonical `/` / `/kr`, hreflang, OG (default rasm yoki `next/og`). */
export async function homeMetadata(locale: Locale): Promise<Metadata> {
  return homeSeo(locale, await getSiteSeo(locale)).metadata
}

/** JSON-LD `ItemList`: yuqori blok + lenta (eng yangisi birinchi). */
const ITEM_LIST_LIMIT = 10

/**
 * Bosh sahifa (OBLOG-68): (1) eng so'nggi yangilik + keyingi 4 tasi, (2) "So'nggi yangiliklar"
 * lentasi (yonida — Telegram, mavzular, ommabop teglar), (3) kategoriya bo'limlari har xil
 * ko'rinishda (`site/home.ts`), (4) Telegram banneri. Hammasi server komponent.
 */
export async function HomeView({ locale }: { locale: Locale }) {
  const t = getSiteStrings(locale)
  const [home, topics, chrome, siteSeo] = await Promise.all([
    getHomeData(locale),
    getCategoryTopics(locale),
    getSiteChrome(locale),
    getSiteSeo(locale),
  ])
  const telegramHref = chrome.telegram[locale]
  const channelName = telegramHandle(telegramHref)
  const listed = [...(home.lead ? [home.lead] : []), ...home.top, ...home.feed]
  // Organization + WebSite (SearchAction) + ItemList (so'nggi maqolalar).
  const { jsonLd } = homeSeo(locale, {
    ...siteSeo,
    latest: listed.slice(0, ITEM_LIST_LIMIT).map((post) => ({ name: post.title, path: post.href })),
  })
  const archiveHref = archivePath(locale)

  return (
    <SitePage locale={locale} pathname={homePath(locale)}>
      <JsonLd data={jsonLd} />
      <Container className="flex flex-col gap-12 py-5 lg:gap-14 lg:py-8">
        <div className="-mb-6 flex items-center justify-between gap-4 border-b border-border pb-3 lg:-mb-8">
          <h1 className="text-sm font-medium text-muted">
            <span className="font-display font-extrabold text-fg">{t.siteName}</span>
            <span className="max-sm:sr-only"> — {t.tagline}</span>
          </h1>
          {home.lead ? (
            <Link
              href={archiveHref}
              data-testid="home-archive-link"
              className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-accent hover:text-accent-hover"
            >
              {t.allNews}
              <ChevronRightIcon className="size-4" aria-hidden />
            </Link>
          ) : null}
        </div>
        {home.lead ? (
          <>
            <LeadBlock locale={locale} lead={home.lead} top={home.top} />
            <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
              {home.feed.length > 0 ? (
                <NewsFeed
                  locale={locale}
                  posts={home.feed}
                  moreHref={archiveHref}
                  className="lg:col-span-8"
                />
              ) : null}
              <aside
                className={cn(
                  'flex flex-col gap-10 lg:col-span-4',
                  home.feed.length === 0 && 'lg:col-start-9',
                )}
              >
                <TelegramCTA
                  locale={locale}
                  href={telegramHref}
                  channelName={channelName}
                  variant="compact"
                />
                <TopicList locale={locale} topics={topics} />
                <TrendingTags locale={locale} tags={home.trendingTags} />
              </aside>
            </div>
            {groupSectionRows(home.sections).map((row) =>
              row.length > 1 ? (
                <div
                  key={row.map((section) => section.category.slug).join('+')}
                  className="grid gap-8 lg:grid-cols-2"
                >
                  {row.map((section) => (
                    <CategorySection key={section.category.slug} locale={locale} {...section} />
                  ))}
                </div>
              ) : (
                row.map((section) => (
                  <CategorySection key={section.category.slug} locale={locale} {...section} />
                ))
              ),
            )}
          </>
        ) : (
          <EmptyState icon={InboxIcon} title={t.emptyTitle} description={t.emptyCategory} />
        )}
        <TelegramCTA locale={locale} href={telegramHref} channelName={channelName} />
      </Container>
    </SitePage>
  )
}
