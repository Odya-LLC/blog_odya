import { getSiteStrings } from '@/i18n/site'
import { cn } from '@/lib/utils'

import { categoryColorStyle } from './CategoryChip'
import { PostCard } from './PostCard'
import { SectionHeading } from './SectionHeading'
import type { CategoryRef, Locale, PostSummary } from './types'

type CategoryBlockProps = {
  locale: Locale
  category: CategoryRef
  /** 1 ta asosiy + 2–4 ta ixcham. */
  posts: PostSummary[]
  className?: string
}

/**
 * Bosh sahifadagi kategoriya bloki (AI, Kibersport, Gadjetlar… — TZ §12.3): sarlavha kategoriya
 * rangida, chapda o'rta kartochka, o'ngda ixcham ro'yxat.
 */
export function CategoryBlock({ locale, category, posts, className }: CategoryBlockProps) {
  const t = getSiteStrings(locale)
  const [first, ...rest] = posts
  if (!first) return null
  const headingId = `category-block-${category.slug}`
  return (
    <section
      aria-labelledby={headingId}
      style={categoryColorStyle(category.slug)}
      className={cn('flex flex-col gap-5', className)}
    >
      <SectionHeading
        id={headingId}
        action={{ label: t.viewAll, href: category.href }}
        barStyle={{ backgroundColor: 'var(--cat-solid)' }}
      >
        {category.name}
      </SectionHeading>
      <div className="grid gap-6 md:grid-cols-2">
        <PostCard post={first} locale={locale} variant="medium" hideCategory />
        {rest.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {rest.slice(0, 4).map((post, index) => (
              <li key={post.id} className={cn(index > 0 && 'border-t border-border pt-4')}>
                <PostCard post={post} locale={locale} variant="small" hideCategory />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
