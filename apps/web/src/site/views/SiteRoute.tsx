import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

import { getCategoryPage, getStaticPage } from '../data'
import { authorPath, categoryPath, tagPath } from '../paths'
import { resolveSiteRoute } from '../route'
import { ArticleView, articleMetadata } from './ArticleView'
import { AuthorView, authorMetadata } from './AuthorView'
import { botMetadata, BotView } from './BotView'
import { CategoryView, categoryMetadata } from './CategoryView'
import { HomeView, homeMetadata } from './HomeView'
import { staticPageMetadata, StaticPageView } from './StaticPageView'
import { TagView, tagMetadata } from './TagView'

type Segments = string[] | undefined

/**
 * `/{slug}`: avval kategoriya, topilmasa — statik sahifa (`pages`). Slug'lar to'qnashmaydi
 * (`slugField({ uniqueAcross })`); ikkalasi ham bo'lmasa — `CategoryView` (redirect yoki 404).
 */
async function staticPageFor(locale: Locale, slug: string) {
  if (await getCategoryPage(locale, slug, 1)) return null
  return getStaticPage(locale, slug)
}

/** `(latn)/[[...path]]` va `kr/[[...path]]` sahifalari — bitta dispetcher, locale parametr bilan. */
export async function SiteRoutePage({ locale, path }: { locale: Locale; path: Segments }) {
  const route = resolveSiteRoute(path)
  switch (route.kind) {
    case 'home':
      return <HomeView locale={locale} />
    case 'category': {
      const page = route.page === 1 ? await staticPageFor(locale, route.category) : null
      if (page) return <StaticPageView locale={locale} page={page} />
      return <CategoryView locale={locale} slug={route.category} page={route.page} />
    }
    case 'category-first-page':
      // `/…/page/1` — kanonik `/{category}`.
      permanentRedirect(categoryPath(locale, route.category))
    case 'article':
      return <ArticleView locale={locale} categorySlug={route.category} slug={route.slug} />
    case 'tag':
      return <TagView locale={locale} slug={route.slug} page={route.page} />
    case 'author':
      return <AuthorView locale={locale} slug={route.slug} page={route.page} />
    case 'listing-first-page':
      permanentRedirect(
        route.listing === 'tag' ? tagPath(locale, route.slug) : authorPath(locale, route.slug),
      )
    case 'bot':
      return <BotView locale={locale} />
    case 'not-found':
      notFound()
  }
}

export async function siteRouteMetadata(locale: Locale, path: Segments): Promise<Metadata> {
  const route = resolveSiteRoute(path)
  switch (route.kind) {
    case 'category': {
      const page = route.page === 1 ? await staticPageFor(locale, route.category) : null
      if (page) return staticPageMetadata(locale, page)
      return categoryMetadata({ locale, slug: route.category, page: route.page })
    }
    case 'article':
      return articleMetadata({ locale, categorySlug: route.category, slug: route.slug })
    case 'tag':
      return tagMetadata({ locale, slug: route.slug, page: route.page })
    case 'author':
      return authorMetadata({ locale, slug: route.slug, page: route.page })
    case 'home':
      return homeMetadata(locale)
    case 'bot':
      return botMetadata(locale)
    default:
      // Redirect / 404 — layout (va not-found) metadata'si.
      return {}
  }
}
