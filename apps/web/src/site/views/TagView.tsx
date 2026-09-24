import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

import { Container } from '@/components/blog/SiteShell'
import { getSiteStrings } from '@/i18n/site'

import { findRedirect, getTagPage, type TagPageData } from '../data'
import { localizePath, tagPath } from '../paths'
import { JsonLd } from '../seo/JsonLd'
import { tagSeo } from '../seo/pages'
import { PostListing } from './PostListing'
import { SitePage } from './SitePage'

type TagViewProps = { locale: Locale; slug: string; page: number }

async function loadOrRedirect({ locale, slug, page }: TagViewProps): Promise<TagPageData> {
  const data = await getTagPage(locale, slug, page)
  if (data) return data
  if (page === 1) {
    // Teg slug'i o'zgargan (plugin-redirects: `tags` → `/tag/{slug}`).
    const redirect = await findRedirect(`/tag/${slug}`)
    if (redirect) permanentRedirect(localizePath(locale, redirect.to))
  }
  notFound()
}

function seoOf(locale: Locale, data: TagPageData) {
  return tagSeo(locale, { ...data.tag, postCount: data.totalDocs }, data.page)
}

/** SEO (TZ §8.1): < 3 post — `noindex`; canonical — o'ziga (sahifalashda ham). */
export async function tagMetadata(props: TagViewProps): Promise<Metadata> {
  const data = await getTagPage(props.locale, props.slug, props.page)
  return data ? seoOf(props.locale, data).metadata : {}
}

/** Teg sahifasi `/tag/{slug}` (TZ §8.1, §12.3): sarlavha + tavsif, kartochkalar, sahifalash. */
export async function TagView(props: TagViewProps) {
  const { locale, page } = props
  const t = getSiteStrings(locale)
  const data = await loadOrRedirect(props)
  const { tag } = data

  return (
    <SitePage locale={locale} pathname={tagPath(locale, tag.slug, page)}>
      <JsonLd data={seoOf(locale, data).jsonLd} />
      <Container className="flex max-w-3xl flex-col gap-8 py-6 lg:py-10">
        <header className="flex flex-col gap-3 border-b border-border pb-6">
          <p className="text-sm font-semibold tracking-wide text-accent uppercase">{t.tag}</p>
          <h1 className="font-display text-3xl font-extrabold text-fg sm:text-4xl">
            #{tag.name}
            {page > 1 ? (
              <span className="ml-2 text-xl font-semibold text-subtle">· {t.page(page)}</span>
            ) : null}
          </h1>
          {tag.description ? <p className="max-w-2xl text-muted">{tag.description}</p> : null}
          <p className="text-sm text-subtle">{t.postsCount(data.totalDocs)}</p>
        </header>
        <PostListing
          locale={locale}
          posts={data.posts}
          page={page}
          totalPages={data.totalPages}
          basePath={tagPath(locale, tag.slug)}
          emptyText={t.emptyTag}
          testId="tag-posts"
        />
      </Container>
    </SitePage>
  )
}
