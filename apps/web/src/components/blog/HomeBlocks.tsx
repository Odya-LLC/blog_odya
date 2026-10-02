import Link from 'next/link'
import type { ReactNode } from 'react'

import { getSiteStrings } from '@/i18n/site'
import { formatShortDate, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'

import { categoryColorStyle } from './CategoryChip'
import { CoverImage } from './CoverImage'
import { PostCard } from './PostCard'
import { SectionHeading } from './SectionHeading'
import { TagList } from './TagList'
import type { CategoryRef, Locale, PostSummary, TagRef } from './types'

/**
 * Bosh sahifa bloklari (OBLOG-68) — server komponentlar, JS yubormaydi:
 * - `LeadBlock`       — eng so'nggi yangilik (katta, LCP) + keyingi 4 tasi;
 * - `NewsFeed`        — "So'nggi yangiliklar" xronologik lentasi (vaqt, kategoriya, kichik rasm);
 * - `CategorySection` — kategoriya bo'limi, 4 xil ko'rinish (`site/home.ts` `HomeLayout`);
 * - `TopicList`, `TrendingTags` — yon panel: mavzular (postlar soni bilan) va ommabop teglar.
 *
 * Sarlavhalar ierarxiyasi: sahifada bitta `h1` (HomeView), bo'limlar — `h2`, kartochkalar — `h3`
 * (yuqori blokdagi asosiy yangilik — `h2`).
 */

type LeadBlockProps = {
  locale: Locale
  lead: PostSummary
  top: PostSummary[]
}

export function LeadBlock({ locale, lead, top }: LeadBlockProps) {
  const t = getSiteStrings(locale)
  return (
    <section
      aria-label={t.topNews}
      data-testid="home-lead"
      className="grid gap-8 lg:grid-cols-12 lg:gap-10"
    >
      <PostCard
        post={lead}
        locale={locale}
        variant="large"
        headingLevel="h2"
        priority
        sizes="(min-width: 1280px) 700px, (min-width: 1024px) 56vw, 100vw"
        className="lg:col-span-7"
      />
      {top.length > 0 ? (
        <ul className="grid content-start gap-5 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-7 lg:col-span-5">
          {top.map((post, index) => (
            <li key={post.id} className={cn(index > 0 && 'max-sm:border-t max-sm:pt-5')}>
              <PostCard
                post={post}
                locale={locale}
                variant="tile"
                headingLevel="h3"
                sizes="(min-width: 1280px) 250px, (min-width: 1024px) 20vw, (min-width: 640px) 45vw, 112px"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/** Lenta vaqti: bugun — "14:05", aks holda "24-sen" + "14:05" (ikki qator). */
function FeedTime({ iso, locale, now }: { iso: string; locale: Locale; now: Date }) {
  const date = formatShortDate(iso, locale)
  const today = formatShortDate(now.toISOString(), locale) === date
  return (
    <time
      dateTime={iso}
      suppressHydrationWarning
      className="flex flex-col pt-0.5 text-sm leading-tight font-semibold text-accent tabular-nums"
    >
      {today ? null : <span className="text-xs font-medium text-subtle">{date}</span>}
      <span>{formatTime(iso, locale)}</span>
    </time>
  )
}

type NewsFeedProps = {
  locale: Locale
  posts: PostSummary[]
  /** Barcha yangiliklar arxivi (`/yangiliklar`). */
  moreHref: string
  className?: string
}

/**
 * "So'nggi yangiliklar" — xronologik lenta: vaqt, sarlavha, kategoriya, o'ngda kichik rasm
 * (lazy). Butun qator bosiladi (stretched link), Tab — sarlavha va kategoriya.
 */
export function NewsFeed({ locale, posts, moreHref, className }: NewsFeedProps) {
  const t = getSiteStrings(locale)
  const now = new Date()
  return (
    <section
      aria-labelledby="home-feed"
      data-testid="home-feed"
      className={cn('flex flex-col gap-2', className)}
    >
      <SectionHeading id="home-feed" action={{ label: t.allNews, href: moreHref }}>
        {t.latestNews}
      </SectionHeading>
      <ol className="flex flex-col">
        {posts.map((post) => (
          <li key={post.id} className="border-b border-border last:border-b-0">
            <article className="group relative isolate grid grid-cols-[3.75rem_1fr_auto] items-start gap-3 py-4 has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-2 has-[[data-card-link]:focus-visible]:outline-accent sm:grid-cols-[4.5rem_1fr_auto] sm:gap-4">
              <FeedTime iso={post.publishedAt} locale={locale} now={now} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <h3 className="font-display text-base leading-snug font-bold text-fg sm:text-[1.0625rem]">
                  <Link
                    href={post.href}
                    data-card-link
                    className="after:absolute after:inset-0 after:content-[''] hover:text-accent focus-visible:outline-none"
                  >
                    {post.isBreaking ? (
                      <span className="mr-1.5 inline-block size-2 rounded-full bg-[#B91C1C] align-middle">
                        <span className="sr-only">{t.breaking}: </span>
                      </span>
                    ) : null}
                    {post.title}
                  </Link>
                </h3>
                {post.excerpt ? (
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted max-sm:hidden">
                    {post.excerpt}
                  </p>
                ) : null}
                <Link
                  href={post.category.href}
                  style={categoryColorStyle(post.category.slug)}
                  className="relative z-10 w-fit text-xs font-semibold text-[var(--cat-fg)] hover:underline"
                >
                  {post.category.name}
                </Link>
              </div>
              <CoverImage
                image={post.cover}
                category={post.category}
                aspect="4/3"
                sizes="(min-width: 640px) 128px, 80px"
                noImageLabel={t.noImage}
                className="w-20 sm:w-32"
              />
            </article>
          </li>
        ))}
      </ol>
      <Link
        href={moreHref}
        className="mt-2 inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-semibold text-fg transition-colors hover:border-accent hover:text-accent"
      >
        {t.allNewsCta}
      </Link>
    </section>
  )
}

type CategorySectionProps = {
  locale: Locale
  category: CategoryRef
  layout: 'feature' | 'grid' | 'headlines' | 'strip'
  posts: PostSummary[]
  className?: string
}

/** Kategoriya bo'limi: sarlavha kategoriya rangida + "Barchasi" (kategoriya sahifasiga). */
export function CategorySection({
  locale,
  category,
  layout,
  posts,
  className,
}: CategorySectionProps) {
  const t = getSiteStrings(locale)
  const headingId = `home-section-${category.slug}`
  let body: ReactNode
  switch (layout) {
    case 'feature':
      body = <FeatureLayout locale={locale} posts={posts} />
      break
    case 'grid':
      body = <GridLayout locale={locale} posts={posts} />
      break
    case 'headlines':
      body = <HeadlinesLayout locale={locale} posts={posts} />
      break
    case 'strip':
      body = <StripLayout locale={locale} posts={posts} />
      break
  }
  return (
    <section
      aria-labelledby={headingId}
      data-testid="home-section"
      data-layout={layout}
      style={categoryColorStyle(category.slug)}
      className={cn(
        'flex min-w-0 flex-col gap-5',
        layout === 'headlines' && 'rounded-lg border border-border bg-surface p-5 sm:p-6',
        className,
      )}
    >
      <SectionHeading
        id={headingId}
        action={{ label: t.viewAll, href: category.href, context: category.name }}
        barStyle={{ backgroundColor: 'var(--cat-solid)' }}
      >
        <Link href={category.href} className="hover:text-accent">
          {category.name}
        </Link>
      </SectionHeading>
      {body}
    </section>
  )
}

type LayoutProps = { locale: Locale; posts: PostSummary[] }

/** 1 katta (lid bilan) + 3 ixcham. */
function FeatureLayout({ locale, posts }: LayoutProps) {
  const [first, ...rest] = posts
  if (!first) return null
  return (
    <div className="grid gap-6 md:grid-cols-12 md:gap-8">
      <PostCard
        post={first}
        locale={locale}
        variant="medium"
        hideCategory
        showExcerpt
        sizes="(min-width: 1280px) 700px, (min-width: 768px) 58vw, 100vw"
        className="md:col-span-7"
      />
      {rest.length > 0 ? (
        <ul className="flex flex-col gap-4 md:col-span-5">
          {rest.map((post, index) => (
            <li key={post.id} className={cn(index > 0 && 'border-t border-border pt-4')}>
              <PostCard post={post} locale={locale} variant="small" hideCategory />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** 4 ta kartochka qatori (mobil — ixcham ro'yxat). */
function GridLayout({ locale, posts }: LayoutProps) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-4">
      {posts.map((post, index) => (
        <li key={post.id} className={cn(index > 0 && 'max-sm:border-t max-sm:pt-5')}>
          <PostCard
            post={post}
            locale={locale}
            variant="tile"
            hideCategory
            sizes="(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 112px"
          />
        </li>
      ))}
    </ul>
  )
}

/** Rasmsiz sarlavhalar: birinchisi lid bilan, qolganlari — sarlavha + vaqt. */
function HeadlinesLayout({ locale, posts }: LayoutProps) {
  const t = getSiteStrings(locale)
  return (
    <ol className="flex flex-col">
      {posts.map((post, index) => (
        <li key={post.id} className={cn(index > 0 && 'border-t border-border', 'py-3 first:pt-0')}>
          <article className="group relative isolate flex flex-col gap-1.5 rounded-sm has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-2 has-[[data-card-link]:focus-visible]:outline-accent">
            <h3
              className={cn(
                'font-display leading-snug font-bold text-fg',
                index === 0 ? 'text-lg sm:text-xl' : 'text-base',
              )}
            >
              <Link
                href={post.href}
                data-card-link
                className="after:absolute after:inset-0 after:content-[''] hover:text-accent focus-visible:outline-none"
              >
                {post.isBreaking ? (
                  <span className="mr-1.5 inline-block size-2 rounded-full bg-[#B91C1C] align-middle">
                    <span className="sr-only">{t.breaking}: </span>
                  </span>
                ) : null}
                {post.title}
              </Link>
            </h3>
            {index === 0 && post.excerpt ? (
              <p className="line-clamp-2 text-sm leading-relaxed text-muted">{post.excerpt}</p>
            ) : null}
            <p className="text-xs text-subtle">
              <time dateTime={post.publishedAt} suppressHydrationWarning>
                {formatShortDate(post.publishedAt, locale)}, {formatTime(post.publishedAt, locale)}
              </time>
            </p>
          </article>
        </li>
      ))}
    </ol>
  )
}

/** Mobilda gorizontal aylantiriladigan lenta (scroll-snap), ≥1024px — 4 ustun. */
function StripLayout({ locale, posts }: LayoutProps) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0">
      {posts.map((post) => (
        <li key={post.id} className="w-[72%] shrink-0 snap-start sm:w-[42%] lg:w-auto">
          <PostCard
            post={post}
            locale={locale}
            variant="poster"
            hideCategory
            sizes="(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 640px) 42vw, 72vw"
          />
        </li>
      ))}
    </ul>
  )
}

export type TopicItem = CategoryRef & { count: number }

/** Mavzular: kategoriyalar (postlar soni bilan) — ichki havolalar, kategoriya rangida. */
export function TopicList({
  locale,
  topics,
  className,
}: {
  locale: Locale
  topics: TopicItem[]
  className?: string
}) {
  const t = getSiteStrings(locale)
  if (topics.length === 0) return null
  return (
    <section aria-labelledby="topics-heading" className={cn('flex flex-col gap-4', className)}>
      <SectionHeading id="topics-heading">{t.topics}</SectionHeading>
      <ul className="flex flex-wrap gap-2">
        {topics.map((topic) => (
          <li key={topic.slug}>
            <Link
              href={topic.href}
              style={categoryColorStyle(topic.slug)}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--cat-bg)] px-3.5 text-sm font-semibold text-[var(--cat-fg)] transition-opacity hover:opacity-85"
            >
              {topic.name}
              <span aria-hidden className="text-xs font-bold tabular-nums opacity-80">
                {topic.count}
              </span>
              <span className="sr-only">({t.postsCount(topic.count)})</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Ommabop teglar (so'nggi postlarda ko'p uchraganlari, faqat indekslanadigan teg sahifalari). */
export function TrendingTags({
  locale,
  tags,
  className,
}: {
  locale: Locale
  tags: TagRef[]
  className?: string
}) {
  const t = getSiteStrings(locale)
  if (tags.length === 0) return null
  return (
    <section aria-labelledby="trending-tags" className={cn('flex flex-col gap-4', className)}>
      <SectionHeading id="trending-tags">{t.trendingTags}</SectionHeading>
      <TagList locale={locale} tags={tags} showLabel={false} />
    </section>
  )
}
