import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { StaticImage as Image } from '@/components/blog/StaticImage'
import { getSiteStrings } from '@/i18n/site'

import { type AuthorPageData, getAuthorPage } from '../data'
import { authorPath } from '../paths'
import { redirectIfMoved } from '../redirects'
import { JsonLd } from '../seo/JsonLd'
import { authorSeo, type AuthorSeoInput } from '../seo/pages'
import { ListingBody } from './ListingView'
import { SitePage } from './SitePage'

type AuthorViewProps = { locale: Locale; slug: string; page: number }

const SOCIAL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  x: 'X',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  website: 'Web',
}

function seoInput(author: AuthorPageData['author']): AuthorSeoInput {
  return {
    slug: author.slug,
    name: author.name,
    position: author.position,
    bio: author.bio,
    image: author.avatarUrl,
    sameAs: author.socials.map((social) => social.url),
  }
}

export async function authorMetadata(props: AuthorViewProps): Promise<Metadata> {
  const data = await getAuthorPage(props.locale, props.slug, props.page)
  if (!data) return {}
  return authorSeo(props.locale, seoInput(data.author), props.page).metadata
}

/**
 * `/author/{slug}` va `/kr/author/{slug}` — muallif profili (E-E-A-T, TZ §8.3): ism, lavozim,
 * bio, ijtimoiy tarmoqlar, `Person` JSON-LD va muallif maqolalari (sahifalash bilan).
 */
export async function AuthorView(props: AuthorViewProps) {
  const { locale, slug, page } = props
  const t = getSiteStrings(locale)
  const data = await getAuthorPage(locale, slug, page)
  if (!data) {
    // Muallif slug'i o'zgargan bo'lsa (plugin-redirects) — yangi URL'ga.
    if (page === 1) await redirectIfMoved(locale, `/author/${slug}`)
    notFound()
  }
  const { author } = data
  const { jsonLd } = authorSeo(locale, seoInput(author), page)

  return (
    <SitePage locale={locale} pathname={authorPath(locale, author.slug, page)}>
      <JsonLd data={jsonLd} />
      <ListingBody
        locale={locale}
        testId="author-posts"
        header={
          <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start">
            {author.avatar ? (
              <Image
                src={author.avatar.src}
                alt={author.avatar.alt || author.name}
                width={96}
                height={96}
                sizes="96px"
                className="size-24 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex size-24 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-4xl font-extrabold text-accent-soft-fg"
              >
                {author.name.slice(0, 1)}
              </span>
            )}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold tracking-wide text-subtle uppercase">
                {t.author}
              </p>
              <h1 className="font-display text-3xl font-extrabold text-fg sm:text-4xl">
                {author.name}
                {page > 1 ? (
                  <span className="ml-2 text-xl font-semibold text-subtle">· {t.page(page)}</span>
                ) : null}
              </h1>
              {author.position ? (
                <p className="font-semibold text-muted">{author.position}</p>
              ) : null}
              {author.bio ? <p className="max-w-2xl text-muted">{author.bio}</p> : null}
              {author.socials.length > 0 ? (
                <ul className="flex flex-wrap gap-3 text-sm">
                  {author.socials.map((social) => (
                    <li key={social.url}>
                      <a
                        href={social.url}
                        rel="me noopener noreferrer"
                        target="_blank"
                        className="font-semibold text-accent underline-offset-4 hover:underline"
                      >
                        {SOCIAL_LABELS[social.platform] ?? social.platform}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              <h2 className="mt-2 text-sm font-bold text-fg">
                {t.authorPosts} · {t.postsCount(data.totalDocs)}
              </h2>
            </div>
          </header>
        }
        posts={data.posts}
        emptyText={t.emptyAuthor}
        page={page}
        totalPages={data.totalPages}
        basePath={authorPath(locale, author.slug)}
        latest={data.latest}
      />
    </SitePage>
  )
}
