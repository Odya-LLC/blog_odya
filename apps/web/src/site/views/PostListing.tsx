import type { Locale } from '@blog-odya/shared'
import { InboxIcon } from 'lucide-react'

import { EmptyState } from '@/components/blog/EmptyState'
import { Pagination } from '@/components/blog/Pagination'
import { PostCard } from '@/components/blog/PostCard'
import type { PostSummary } from '@/components/blog/types'
import { getSiteStrings } from '@/i18n/site'

type PostListingProps = {
  locale: Locale
  posts: PostSummary[]
  page: number
  totalPages: number
  /** 1-sahifa yo'li (`/tag/x`) — n-sahifa `…/page/n`. */
  basePath?: string
  /** Boshqa URL sxemasi (qidiruv: `?page=n`). */
  hrefFor?: (page: number) => string
  emptyText: string
  testId?: string
}

/** Post kartochkalari ro'yxati + sahifalash (teg, muallif, qidiruv — kategoriya bilan bir xil). */
export function PostListing({
  locale,
  posts,
  page,
  totalPages,
  basePath = '/',
  hrefFor,
  emptyText,
  testId,
}: PostListingProps) {
  const t = getSiteStrings(locale)
  return (
    <>
      {posts.length > 0 ? (
        <ul className="flex flex-col gap-6" data-testid={testId}>
          {posts.map((post, index) => (
            <li key={post.id} className="border-b border-border pb-6 last:border-b-0">
              <PostCard
                post={post}
                locale={locale}
                variant="list"
                headingLevel="h2"
                priority={index === 0}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={InboxIcon} title={t.emptyTitle} description={emptyText} />
      )}
      <Pagination
        locale={locale}
        currentPage={page}
        totalPages={totalPages}
        basePath={basePath}
        hrefFor={hrefFor}
      />
    </>
  )
}
