import type { Locale } from '@blog-odya/shared'
import { InboxIcon } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

import { AdSlot } from '@/components/blog/AdSlot'
import { EmptyState } from '@/components/blog/EmptyState'
import { LatestFeed } from '@/components/blog/LatestFeed'
import { Pagination } from '@/components/blog/Pagination'
import { PostCard } from '@/components/blog/PostCard'
import { Container } from '@/components/blog/SiteShell'
import { getSiteStrings } from '@/i18n/site'

import { findRedirect, getCategoryPage } from '../data'
import { categoryPath, localizePath } from '../paths'
import { JsonLd } from '../seo/JsonLd'
import { categorySeo } from '../seo/pages'
import { SitePage } from './SitePage'

type CategoryViewProps = { locale: Locale; slug: string; page: number }

async function loadOrRedirect({ locale, slug, page }: CategoryViewProps) {
  const data = await getCategoryPage(locale, slug, page)
  if (data) return data
  if (page === 1) {
    // Kategoriya slug'i o'zgargan bo'lsa (plugin-redirects) — yangi URL'ga.
    const redirect = await findRedirect(`/${slug}`)
    if (redirect) permanentRedirect(localizePath(locale, redirect.to))
  }
  notFound()
}

/** SEO (TZ §8.2): sahifalashda ham canonical — o'ziga (`/{category}/page/{n}`). */
export async function categoryMetadata(props: CategoryViewProps): Promise<Metadata> {
  const data = await getCategoryPage(props.locale, props.slug, props.page)
  if (!data) return {}
  return categorySeo(props.locale, data.category, props.page).metadata
}

/**
 * Kategoriya sahifasi (TZ §8.1, §12.3; maket — `/styleguide/layouts/category`):
 * sarlavha + SEO tavsif, kartochkalar ro'yxati, sahifalash `/{category}/page/{n}`.
 */
export async function CategoryView(props: CategoryViewProps) {
  const { locale, slug, page } = props
  const t = getSiteStrings(locale)
  const data = await loadOrRedirect(props)
  const { category } = data
  const { jsonLd } = categorySeo(locale, category, page)

  return (
    <SitePage
      locale={locale}
      pathname={categoryPath(locale, slug, page)}
      activeCategorySlug={category.slug}
    >
      <JsonLd data={jsonLd} />
      <Container className="grid gap-10 py-6 lg:grid-cols-12 lg:py-10">
        <div className="flex flex-col gap-8 lg:col-span-8">
          <header className="flex flex-col gap-3 border-b border-border pb-6">
            <h1 className="font-display text-3xl font-extrabold text-fg sm:text-4xl">
              {category.name}
              {page > 1 ? (
                <span className="ml-2 text-xl font-semibold text-subtle">· {t.page(page)}</span>
              ) : null}
            </h1>
            {category.description ? (
              <p className="max-w-2xl text-muted">{category.description}</p>
            ) : null}
          </header>
          {data.posts.length > 0 ? (
            <ul className="flex flex-col gap-6" data-testid="category-posts">
              {data.posts.map((post, index) => (
                <li key={post.id} className="border-b border-border pb-6 last:border-b-0">
                  <PostCard
                    post={post}
                    locale={locale}
                    variant="list"
                    headingLevel="h2"
                    priority={index === 0}
                    hideCategory
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={InboxIcon} title={t.emptyTitle} description={t.emptyCategory} />
          )}
          <Pagination
            locale={locale}
            currentPage={page}
            totalPages={data.totalPages}
            basePath={categoryPath(locale, category.slug)}
          />
        </div>
        <aside className="flex flex-col gap-8 lg:col-span-4">
          {data.latest.length > 0 ? <LatestFeed locale={locale} posts={data.latest} /> : null}
          <AdSlot locale={locale} position="sidebar" />
        </aside>
      </Container>
    </SitePage>
  )
}
