import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

import { categoryPath } from '../paths'
import { resolveSiteRoute } from '../route'
import { ArticleView, articleMetadata } from './ArticleView'
import { CategoryView, categoryMetadata } from './CategoryView'
import { HomeView } from './HomeView'

type Segments = string[] | undefined

/** `(latn)/[[...path]]` va `kr/[[...path]]` sahifalari — bitta dispetcher, locale parametr bilan. */
export async function SiteRoutePage({ locale, path }: { locale: Locale; path: Segments }) {
  const route = resolveSiteRoute(path)
  switch (route.kind) {
    case 'home':
      return <HomeView locale={locale} />
    case 'category':
      return <CategoryView locale={locale} slug={route.category} page={route.page} />
    case 'category-first-page':
      // `/…/page/1` — kanonik `/{category}`.
      permanentRedirect(categoryPath(locale, route.category))
    case 'article':
      return <ArticleView locale={locale} categorySlug={route.category} slug={route.slug} />
    case 'not-found':
      notFound()
  }
}

export async function siteRouteMetadata(locale: Locale, path: Segments): Promise<Metadata> {
  const route = resolveSiteRoute(path)
  switch (route.kind) {
    case 'category':
      return categoryMetadata({ locale, slug: route.category, page: route.page })
    case 'article':
      return articleMetadata({ locale, categorySlug: route.category, slug: route.slug })
    default:
      // Bosh sahifa — layout metadata'si.
      return {}
  }
}
