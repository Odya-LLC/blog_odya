import type { Locale } from '@blog-odya/shared'
import { InboxIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { AdSlot } from '@/components/blog/AdSlot'
import { EmptyState } from '@/components/blog/EmptyState'
import { LatestFeed } from '@/components/blog/LatestFeed'
import { Pagination } from '@/components/blog/Pagination'
import { PostCard } from '@/components/blog/PostCard'
import { Container } from '@/components/blog/SiteShell'
import type { PostSummary } from '@/components/blog/types'
import { getSiteStrings } from '@/i18n/site'

type ListingBodyProps = {
  locale: Locale
  /** Sarlavha bloki (`<h1>` va tavsif). */
  header: ReactNode
  posts: PostSummary[]
  /** `null` — bo'sh holat ko'rsatilmaydi (masalan, qidiruv so'rovisiz). */
  emptyText: string | null
  page: number
  totalPages: number
  /** 1-sahifa yo'li (`/tag/x`) — `…/page/n` shundan (TZ §8.1). */
  basePath?: string
  /** Boshqa sahifalash sxemasi (qidiruv: `?q=…&page=n`). */
  hrefForPage?: (page: number) => string
  latest?: PostSummary[]
  testId?: string
}

/**
 * Ro'yxat sahifalari (teg, muallif, qidiruv) karkasi — kategoriya sahifasi maketi bilan bir xil
 * (TZ §12.3 "Kategoriya / teg"): sarlavha, kartochkalar ro'yxati, sahifalash, yon panel.
 */
export function ListingBody({
  locale,
  header,
  posts,
  emptyText,
  page,
  totalPages,
  basePath = '/',
  hrefForPage,
  latest = [],
  testId,
}: ListingBodyProps) {
  const t = getSiteStrings(locale)
  return (
    <Container className="grid gap-10 py-6 lg:grid-cols-12 lg:py-10">
      <div className="flex flex-col gap-8 lg:col-span-8">
        {header}
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
          emptyText !== null && (
            <EmptyState icon={InboxIcon} title={t.emptyTitle} description={emptyText} />
          )
        )}
        <Pagination
          locale={locale}
          currentPage={page}
          totalPages={totalPages}
          basePath={basePath}
          hrefForPage={hrefForPage}
        />
      </div>
      <aside className="flex flex-col gap-8 lg:col-span-4">
        {latest.length > 0 ? <LatestFeed locale={locale} posts={latest} /> : null}
        <AdSlot locale={locale} position="sidebar" />
      </aside>
    </Container>
  )
}
