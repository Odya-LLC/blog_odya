import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { TopicList } from '@/components/blog/HomeBlocks'
import { getSiteStrings } from '@/i18n/site'

import { getArchivePage, getCategoryTopics } from '../data'
import { archivePath } from '../paths'
import { JsonLd } from '../seo/JsonLd'
import { archiveSeo } from '../seo/pages'
import { ListingBody } from './ListingView'
import { SitePage } from './SitePage'

type ArchiveViewProps = { locale: Locale; page: number }

/** SEO: canonical — o'ziga (`/yangiliklar/page/{n}`), hreflang, breadcrumb, `ItemList`. */
export async function archiveMetadata({ locale, page }: ArchiveViewProps): Promise<Metadata> {
  const data = await getArchivePage(locale, page)
  if (!data) return {}
  return archiveSeo(locale, page).metadata
}

/**
 * Barcha yangiliklar arxivi (OBLOG-68): `/yangiliklar`, `/kr/yangiliklar` (`/page/{n}` bilan) —
 * barcha chop etilgan postlar, eng yangisi birinchi. Yon panelda — mavzular (kategoriyalar).
 */
export async function ArchiveView({ locale, page }: ArchiveViewProps) {
  const t = getSiteStrings(locale)
  const [data, topics] = await Promise.all([
    getArchivePage(locale, page),
    getCategoryTopics(locale),
  ])
  if (!data) notFound()
  const { jsonLd } = archiveSeo(
    locale,
    page,
    data.posts.map((post) => ({ name: post.title, path: post.href })),
  )

  return (
    <SitePage locale={locale} pathname={archivePath(locale, page)}>
      <JsonLd data={jsonLd} />
      <ListingBody
        locale={locale}
        testId="archive-posts"
        header={
          <header className="flex flex-col gap-3 border-b border-border pb-6">
            <h1 className="font-display text-3xl font-extrabold text-fg sm:text-4xl">
              {t.allNews}
              {page > 1 ? (
                <span className="ml-2 text-xl font-semibold text-subtle">· {t.page(page)}</span>
              ) : null}
            </h1>
            <p className="max-w-2xl text-muted">{t.archiveDescription}</p>
            <p className="text-sm text-subtle">{t.postsCount(data.totalDocs)}</p>
          </header>
        }
        posts={data.posts}
        emptyText={t.emptyCategory}
        page={page}
        totalPages={data.totalPages}
        basePath={archivePath(locale)}
        aside={<TopicList locale={locale} topics={topics} />}
      />
    </SitePage>
  )
}
