import type { Locale } from '@blog-odya/shared'
import { ArrowLeftIcon } from 'lucide-react'
import Link from 'next/link'

import { AdSlot } from '@/components/blog/AdSlot'
import { ArticleBody } from '@/components/blog/ArticleBody'
import { ArticleHeader } from '@/components/blog/ArticleHeader'
import { CategoryBlock } from '@/components/blog/CategoryBlock'
import { EmptyState } from '@/components/blog/EmptyState'
import { HeroBlock } from '@/components/blog/HeroBlock'
import { LatestFeed } from '@/components/blog/LatestFeed'
import { NotFound } from '@/components/blog/NotFound'
import { Pagination } from '@/components/blog/Pagination'
import { PostCard } from '@/components/blog/PostCard'
import { RelatedPosts } from '@/components/blog/RelatedPosts'
import { SearchForm } from '@/components/blog/SearchForm'
import { ShareButtons } from '@/components/blog/ShareButtons'
import { Container, SiteShell } from '@/components/blog/SiteShell'
import { SourceBox } from '@/components/blog/SourceBox'
import { TagList } from '@/components/blog/TagList'
import { TelegramCTA } from '@/components/blog/TelegramCTA'
import { buttonVariants } from '@/components/ui/button'
import { getSiteStrings } from '@/i18n/site'
import { withLocalePrefix } from '@/lib/preferences'
import { cn } from '@/lib/utils'

import { SampleArticleBody } from './article'
import { getSample, SAMPLE_SITE_URL, SAMPLE_TELEGRAM_NAME, type Sample } from './sample'

/** Sahifa maketlari (TZ §12.3) — M1-05/M1-07 dagi haqiqiy sahifalar uchun andoza. */
export const LAYOUTS = {
  home: { 'uz-Latn': 'Bosh sahifa', 'uz-Cyrl': 'Бош саҳифа' },
  article: { 'uz-Latn': 'Maqola', 'uz-Cyrl': 'Мақола' },
  category: { 'uz-Latn': 'Kategoriya', 'uz-Cyrl': 'Категория' },
  search: { 'uz-Latn': 'Boʻsh qidiruv', 'uz-Cyrl': 'Бўш қидирув' },
  'not-found': { 'uz-Latn': '404', 'uz-Cyrl': '404' },
} as const satisfies Record<string, Record<Locale, string>>

export type LayoutName = keyof typeof LAYOUTS

export function isLayoutName(value: string): value is LayoutName {
  return Object.hasOwn(LAYOUTS, value)
}

/** Styleguide ichida yozuvni `?script=kr` bilan almashtiramiz (haqiqiy saytda — `/kr` prefiksi). */
export function styleguideHrefs(path: string): Record<Locale, string> {
  return { 'uz-Latn': path, 'uz-Cyrl': `${path}?script=kr` }
}

function shellProps(sample: Sample, path: string, activeCategorySlug?: string) {
  return {
    header: {
      categories: sample.categories,
      alternateHrefs: styleguideHrefs(path),
      telegramHref: sample.telegram[sample.locale],
      activeCategorySlug,
    },
    footer: {
      categories: sample.categories,
      legalLinks: sample.legalLinks,
      telegram: sample.telegram,
    },
  }
}

export function LayoutPreview({ layout, locale }: { layout: LayoutName; locale: Locale }) {
  const sample = getSample(locale)
  const path = `/styleguide/layouts/${layout}`
  switch (layout) {
    case 'home':
      return <HomeLayout sample={sample} path={path} />
    case 'article':
      return <ArticleLayout sample={sample} path={path} />
    case 'category':
      return <CategoryLayout sample={sample} path={path} />
    case 'search':
      return <SearchLayout sample={sample} path={path} />
    case 'not-found':
      return (
        <SiteShell locale={locale} {...shellProps(sample, path)}>
          <Container>
            <NotFound locale={locale} />
          </Container>
        </SiteShell>
      )
  }
}

function HomeLayout({ sample, path }: { sample: Sample; path: string }) {
  const { locale, posts } = sample
  const [main, ...rest] = posts
  const byCategory = (slug: string) => posts.filter((post) => post.category.slug === slug)
  const categoryRef = (slug: string) => {
    const category = sample.categories.find((item) => item.slug === slug)!
    return { slug: category.slug, name: category.name, href: category.href }
  }
  return (
    <SiteShell locale={locale} {...shellProps(sample, path)}>
      <Container className="flex flex-col gap-12 py-6 lg:py-10">
        <AdSlot locale={locale} position="below-header" />
        <HeroBlock locale={locale} main={main!} secondary={rest.slice(0, 4)} />
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="flex flex-col gap-12 lg:col-span-8">
            <CategoryBlock
              locale={locale}
              category={categoryRef('suniy-intellekt')}
              posts={[...byCategory('suniy-intellekt'), posts[4]!, posts[5]!]}
            />
            <CategoryBlock
              locale={locale}
              category={categoryRef('kibersport')}
              posts={[...byCategory('kibersport'), posts[7]!]}
            />
            <CategoryBlock
              locale={locale}
              category={categoryRef('gadjetlar')}
              posts={[...byCategory('gadjetlar'), posts[8]!]}
            />
          </div>
          <aside className="flex flex-col gap-8 lg:col-span-4">
            <LatestFeed
              locale={locale}
              posts={posts.slice(0, 8)}
              moreHref={withLocalePrefix(locale, '/')}
            />
            <TelegramCTA
              locale={locale}
              href={sample.telegram[locale]}
              channelName={SAMPLE_TELEGRAM_NAME[locale]}
              variant="compact"
            />
          </aside>
        </div>
        <TelegramCTA
          locale={locale}
          href={sample.telegram[locale]}
          channelName={SAMPLE_TELEGRAM_NAME[locale]}
        />
      </Container>
    </SiteShell>
  )
}

function ArticleLayout({ sample, path }: { sample: Sample; path: string }) {
  const { locale, posts } = sample
  const post = posts[0]!
  return (
    <SiteShell locale={locale} {...shellProps(sample, path, post.category.slug)}>
      <Container className="flex flex-col gap-10 py-6 lg:py-10">
        <article className="flex flex-col gap-8">
          <ArticleHeader
            locale={locale}
            category={post.category}
            title={post.title}
            excerpt={post.excerpt}
            authors={sample.authors}
            publishedAt={post.publishedAt}
            readingTime={post.readingTime}
            cover={post.cover}
            coverCaption={locale === 'uz-Latn' ? 'Tasvir: OpenAI' : 'Тасвир: OpenAI'}
          />
          <ArticleBody lang={locale}>
            <SampleArticleBody locale={locale} />
          </ArticleBody>
          <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
            <SourceBox
              locale={locale}
              sources={sample.sources}
              aiDisclosure
              className="max-w-none"
            />
            <TagList locale={locale} tags={sample.tags} />
            <ShareButtons
              locale={locale}
              url={`${SAMPLE_SITE_URL}${post.href}`}
              title={post.title}
              className="border-t border-border pt-6"
            />
          </div>
        </article>
        <RelatedPosts locale={locale} posts={posts.slice(1, 4)} />
        <TelegramCTA
          locale={locale}
          href={sample.telegram[locale]}
          channelName={SAMPLE_TELEGRAM_NAME[locale]}
        />
      </Container>
    </SiteShell>
  )
}

function CategoryLayout({ sample, path }: { sample: Sample; path: string }) {
  const { locale, posts } = sample
  const category = sample.categories.find((item) => item.slug === 'kibersport')!
  const description =
    locale === 'uz-Latn'
      ? 'Turnirlar, natijalar, transferlar va jamoalar haqidagi soʻnggi yangiliklar: CS2, Dota 2, MLBB, PUBG Mobile va boshqa fanlar boʻyicha.'
      : 'Турнирлар, натижалар, трансферлар ва жамоалар ҳақидаги сўнгги янгиликлар: CS2, Dota 2, MLBB, PUBG Mobile ва бошқа фанлар бўйича.'
  return (
    <SiteShell locale={locale} {...shellProps(sample, path, category.slug)}>
      <Container className="grid gap-10 py-6 lg:grid-cols-12 lg:py-10">
        <div className="flex flex-col gap-8 lg:col-span-8">
          <header className="flex flex-col gap-3 border-b border-border pb-6">
            <h1 className="font-display text-3xl font-extrabold text-fg sm:text-4xl">
              {category.name}
            </h1>
            <p className="max-w-2xl text-muted">{description}</p>
          </header>
          <ul className="flex flex-col gap-6">
            {posts.slice(0, 6).map((post) => (
              <li key={post.id} className="border-b border-border pb-6 last:border-b-0">
                <PostCard post={post} locale={locale} variant="list" headingLevel="h2" />
              </li>
            ))}
          </ul>
          <Pagination
            locale={locale}
            currentPage={1}
            totalPages={12}
            basePath={withLocalePrefix(locale, `/${category.slug}`)}
          />
        </div>
        <aside className="flex flex-col gap-8 lg:col-span-4">
          <LatestFeed locale={locale} posts={posts.slice(0, 6)} />
          <AdSlot locale={locale} position="sidebar" />
        </aside>
      </Container>
    </SiteShell>
  )
}

function SearchLayout({ sample, path }: { sample: Sample; path: string }) {
  const { locale } = sample
  const t = getSiteStrings(locale)
  const query = locale === 'uz-Latn' ? 'kvant kompyuter narxi' : 'квант компьютер нархи'
  return (
    <SiteShell locale={locale} {...shellProps(sample, path)}>
      <Container className="flex max-w-3xl flex-col gap-8 py-8 lg:py-12">
        <h1 className="font-display text-3xl font-extrabold text-fg">{t.search}</h1>
        <SearchForm locale={locale} defaultValue={query} />
        <EmptyState
          title={t.emptyTitle}
          description={t.emptySearch(query)}
          action={
            <Link
              href={withLocalePrefix(locale, '/')}
              className={cn(buttonVariants({ variant: 'outline' }), 'rounded-full')}
            >
              <ArrowLeftIcon aria-hidden />
              {t.backHome}
            </Link>
          }
        />
      </Container>
    </SiteShell>
  )
}
