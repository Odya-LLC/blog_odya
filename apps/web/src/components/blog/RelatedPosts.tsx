import { useId } from 'react'

import { getSiteStrings } from '@/i18n/site'
import { cn } from '@/lib/utils'

import { PostCard } from './PostCard'
import { SectionHeading } from './SectionHeading'
import type { Locale, PostSummary } from './types'

type RelatedPostsProps = {
  locale: Locale
  /** 3–6 ta (teg/kategoriya kesishmasi — M1-05). */
  posts: PostSummary[]
  className?: string
}

/** "O'xshash maqolalar" — maqola oxirida; mobil 1, planshet 2, desktop 3 ustun. */
export function RelatedPosts({ locale, posts, className }: RelatedPostsProps) {
  const t = getSiteStrings(locale)
  const headingId = useId()
  if (posts.length === 0) return null
  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-6', className)}>
      <SectionHeading id={headingId}>{t.related}</SectionHeading>
      <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {posts.slice(0, 6).map((post) => (
          <li key={post.id}>
            <PostCard post={post} locale={locale} variant="medium" headingLevel="h3" />
          </li>
        ))}
      </ul>
    </section>
  )
}
