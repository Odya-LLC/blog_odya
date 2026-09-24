import type { Locale } from '@blog-odya/shared'
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'

import { Container } from '@/components/blog/SiteShell'
import { SOCIAL_PLATFORMS } from '@/collections/Authors'
import { getSiteStrings } from '@/i18n/site'

import { type AuthorPageData, getAuthorPage } from '../data'
import { authorPath } from '../paths'
import { JsonLd } from '../seo/JsonLd'
import { authorSeo } from '../seo/pages'
import { PostListing } from './PostListing'
import { SitePage } from './SitePage'

type AuthorViewProps = { locale: Locale; slug: string; page: number }

const PLATFORM_LABELS = new Map<string, string>(
  SOCIAL_PLATFORMS.map(({ label, value }) => [value, label]),
)

async function load({ locale, slug, page }: AuthorViewProps): Promise<AuthorPageData> {
  const data = await getAuthorPage(locale, slug, page)
  if (!data) notFound()
  return data
}

/** SEO (TZ §8.2, §8.3 E-E-A-T): `Person` JSON-LD, canonical — o'ziga. */
export async function authorMetadata(props: AuthorViewProps): Promise<Metadata> {
  const data = await getAuthorPage(props.locale, props.slug, props.page)
  return data ? authorSeo(props.locale, data.author, props.page).metadata : {}
}

/** Muallif sahifasi `/author/{slug}` (TZ §7, §8.1): profil (avatar, lavozim, bio, tarmoqlar) + maqolalar. */
export async function AuthorView(props: AuthorViewProps) {
  const { locale, page } = props
  const t = getSiteStrings(locale)
  const data = await load(props)
  const { author } = data

  return (
    <SitePage locale={locale} pathname={authorPath(locale, author.slug, page)}>
      <JsonLd data={authorSeo(locale, author, page).jsonLd} />
      <Container className="flex max-w-3xl flex-col gap-8 py-6 lg:py-10">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start">
          {author.avatar ? (
            <Image
              src={author.avatar.src}
              alt={author.avatar.alt || author.name}
              width={author.avatar.width}
              height={author.avatar.height}
              sizes="96px"
              className="size-24 shrink-0 rounded-full object-cover"
            />
          ) : null}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold tracking-wide text-accent uppercase">{t.author}</p>
            <h1 className="font-display text-3xl font-extrabold text-fg sm:text-4xl">
              {author.name}
              {page > 1 ? (
                <span className="ml-2 text-xl font-semibold text-subtle">· {t.page(page)}</span>
              ) : null}
            </h1>
            {author.position ? <p className="font-semibold text-muted">{author.position}</p> : null}
            {author.bio ? <p className="max-w-2xl text-muted">{author.bio}</p> : null}
            {author.socials.length > 0 ? (
              <ul aria-label={t.authorSocials} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {author.socials.map((social) => (
                  <li key={social.url}>
                    <a
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer me"
                      className="font-semibold text-accent underline-offset-4 hover:underline"
                    >
                      {PLATFORM_LABELS.get(social.platform) ?? social.platform}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-sm text-subtle">{t.postsCount(data.totalDocs)}</p>
          </div>
        </header>
        <section aria-labelledby="author-posts" className="flex flex-col gap-6">
          <h2 id="author-posts" className="sr-only">
            {t.authorPosts}
          </h2>
          <PostListing
            locale={locale}
            posts={data.posts}
            page={page}
            totalPages={data.totalPages}
            basePath={authorPath(locale, author.slug)}
            emptyText={t.emptyAuthor}
            testId="author-posts"
          />
        </section>
      </Container>
    </SitePage>
  )
}
