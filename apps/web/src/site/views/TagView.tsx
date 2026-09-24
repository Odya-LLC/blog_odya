import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

import { getSiteStrings } from '@/i18n/site'

import { findRedirect, getTagPage } from '../data'
import { localizePath, tagPath } from '../paths'
import { JsonLd } from '../seo/JsonLd'
import { tagSeo } from '../seo/pages'
import { ListingBody } from './ListingView'
import { SitePage } from './SitePage'

type TagViewProps = { locale: Locale; slug: string; page: number }

async function loadOrRedirect({ locale, slug, page }: TagViewProps) {
  const data = await getTagPage(locale, slug, page)
  if (data) return data
  if (page === 1) {
    // Teg slug'i o'zgargan bo'lsa (plugin-redirects) — yangi URL'ga.
    const redirect = await findRedirect(`/tag/${slug}`)
    if (redirect) permanentRedirect(localizePath(locale, redirect.to))
  }
  notFound()
}

/** SEO: canonical — o'ziga; < 3 post yoki `meta.noindex` — `noindex, follow` (TZ §8.1). */
export async function tagMetadata(props: TagViewProps): Promise<Metadata> {
  const data = await getTagPage(props.locale, props.slug, props.page)
  if (!data) return {}
  return tagSeo(props.locale, data.tag, props.page, data.totalDocs).metadata
}

/** `/tag/{slug}` va `/kr/tag/{slug}` (`/page/{n}` bilan) — teg bo'yicha postlar. */
export async function TagView(props: TagViewProps) {
  const { locale, page } = props
  const t = getSiteStrings(locale)
  const data = await loadOrRedirect(props)
  const { tag } = data
  const { jsonLd } = tagSeo(locale, tag, page, data.totalDocs)

  return (
    <SitePage locale={locale} pathname={tagPath(locale, tag.slug, page)}>
      <JsonLd data={jsonLd} />
      <ListingBody
        locale={locale}
        testId="tag-posts"
        header={
          <header className="flex flex-col gap-3 border-b border-border pb-6">
            <p className="text-sm font-semibold tracking-wide text-subtle uppercase">{t.tag}</p>
            <h1 className="font-display text-3xl font-extrabold text-fg sm:text-4xl">
              <span aria-hidden className="mr-1 text-subtle">
                #
              </span>
              {tag.name}
              {page > 1 ? (
                <span className="ml-2 text-xl font-semibold text-subtle">· {t.page(page)}</span>
              ) : null}
            </h1>
            {tag.description ? <p className="max-w-2xl text-muted">{tag.description}</p> : null}
            <p className="text-sm text-subtle">{t.postsCount(data.totalDocs)}</p>
          </header>
        }
        posts={data.posts}
        emptyText={t.emptyTag}
        page={page}
        totalPages={data.totalPages}
        basePath={tagPath(locale, tag.slug)}
        latest={data.latest}
      />
    </SitePage>
  )
}
