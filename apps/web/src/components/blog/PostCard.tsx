import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { getSiteStrings } from '@/i18n/site'
import { cn } from '@/lib/utils'

import { CategoryChip } from './CategoryChip'
import { CoverImage } from './CoverImage'
import { PostMeta } from './PostMeta'
import type { Locale, PostSummary } from './types'

export type PostCardVariant = 'large' | 'medium' | 'small' | 'list'

type PostCardProps = {
  post: PostSummary
  locale: Locale
  variant?: PostCardVariant
  /** Sahifa ierarxiyasiga mos sarlavha darajasi. */
  headingLevel?: 'h2' | 'h3' | 'h4'
  /** LCP kartochkasi (hero) uchun. */
  priority?: boolean
  /** Kategoriya belgisini yashirish (masalan, kategoriya sahifasida). */
  hideCategory?: boolean
  className?: string
}

/**
 * Maqola kartochkasi — 4 variant (TZ §12.2–12.3, The Verge uslubidagi qalin sarlavhalar):
 * - `large`  — hero: 16:9 muqova, katta sarlavha, lid;
 * - `medium` — to'r (grid): 16:9 muqova, sarlavha, meta;
 * - `small`  — ixcham: chapda 4:3 kichik rasm, sarlavha, vaqt (sidebar, o'xshash maqolalar);
 * - `list`   — ro'yxat (kategoriya/teg/qidiruv): chapda rasm, sarlavha, lid, meta.
 *
 * Butun kartochka bosiladi ("stretched link"), lekin Tab bilan faqat 2 to'xtash: kategoriya va sarlavha.
 * Server komponent — JS yubormaydi.
 */
export function PostCard({
  post,
  locale,
  variant = 'medium',
  headingLevel = 'h3',
  priority = false,
  hideCategory = false,
  className,
}: PostCardProps) {
  const t = getSiteStrings(locale)
  const Heading = headingLevel

  const title = (
    <Link
      href={post.href}
      data-card-link
      className="after:absolute after:inset-0 after:content-[''] hover:text-accent focus-visible:outline-none"
    >
      {post.title}
    </Link>
  )

  const chips =
    hideCategory && !post.isBreaking ? null : (
      <div className="flex flex-wrap items-center gap-2">
        {post.isBreaking ? (
          <Badge variant="breaking" size="sm" className="relative z-10">
            {t.breaking}
          </Badge>
        ) : null}
        {hideCategory ? null : <CategoryChip category={post.category} />}
      </div>
    )

  const base =
    'group relative isolate rounded-md has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-4 has-[[data-card-link]:focus-visible]:outline-accent'

  if (variant === 'large') {
    return (
      <article className={cn(base, 'flex flex-col gap-4', className)}>
        <CoverImage
          image={post.cover}
          category={post.category}
          aspect="16/9"
          sizes="(min-width: 1280px) 780px, (min-width: 1024px) 62vw, 100vw"
          priority={priority}
          noImageLabel={t.noImage}
          className="rounded-lg"
        />
        <div className="flex flex-col gap-3">
          {chips}
          <Heading className="font-display text-[1.625rem] leading-[1.12] font-extrabold text-balance text-fg sm:text-4xl lg:text-[2.75rem]">
            {title}
          </Heading>
          {post.excerpt ? (
            <p className="line-clamp-3 text-base leading-relaxed text-muted sm:text-lg">
              {post.excerpt}
            </p>
          ) : null}
          <PostMeta locale={locale} publishedAt={post.publishedAt} readingTime={post.readingTime} />
        </div>
      </article>
    )
  }

  if (variant === 'small') {
    return (
      <article className={cn(base, 'flex items-start gap-3', className)}>
        <CoverImage
          image={post.cover}
          category={post.category}
          aspect="4/3"
          sizes="112px"
          noImageLabel={t.noImage}
          className="w-24 shrink-0 sm:w-28"
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          {hideCategory ? null : (
            <span className="text-xs font-semibold text-muted">{post.category.name}</span>
          )}
          <Heading className="line-clamp-3 text-[0.9375rem] leading-snug font-semibold text-fg">
            {title}
          </Heading>
          <PostMeta locale={locale} publishedAt={post.publishedAt} />
        </div>
      </article>
    )
  }

  if (variant === 'list') {
    return (
      <article
        className={cn(base, 'grid grid-cols-[7rem_1fr] gap-4 sm:grid-cols-[15rem_1fr]', className)}
      >
        <CoverImage
          image={post.cover}
          category={post.category}
          aspect="16/9"
          sizes="(min-width: 640px) 240px, 112px"
          noImageLabel={t.noImage}
          className="max-sm:aspect-[4/3]"
        />
        <div className="flex min-w-0 flex-col gap-2">
          {chips}
          <Heading className="font-display text-base leading-snug font-bold text-fg sm:text-xl">
            {title}
          </Heading>
          {post.excerpt ? (
            <p className="line-clamp-2 text-sm leading-relaxed text-muted max-sm:hidden">
              {post.excerpt}
            </p>
          ) : null}
          <PostMeta locale={locale} publishedAt={post.publishedAt} readingTime={post.readingTime} />
        </div>
      </article>
    )
  }

  // medium
  return (
    <article className={cn(base, 'flex flex-col gap-3', className)}>
      <CoverImage
        image={post.cover}
        category={post.category}
        aspect="16/9"
        sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw"
        noImageLabel={t.noImage}
      />
      <div className="flex flex-col gap-2">
        {chips}
        <Heading className="font-display text-lg leading-snug font-bold text-balance text-fg sm:text-xl">
          {title}
        </Heading>
        <PostMeta locale={locale} publishedAt={post.publishedAt} readingTime={post.readingTime} />
      </div>
    </article>
  )
}
