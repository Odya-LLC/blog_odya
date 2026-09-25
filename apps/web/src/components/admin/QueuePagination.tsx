'use client'

import { Pagination, PerPage } from '@payloadcms/ui'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { DEFAULT_QUEUE_PAGE_SIZE, QUEUE_PAGE_SIZES, type QueuePageInfo } from '@/editorial/queue'

/**
 * Navbat sahifalash paneli (OBLOG-40) — Payload admin'ning `Pagination` va `PerPage`
 * komponentlari. Holat URL'da (`?page=…&limit=…`), sahifa server tomonda render qilinadi.
 */
export function QueuePagination({ info }: { info: QueuePageInfo }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const go = (patch: { page?: number; limit?: number }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (patch.limit !== undefined) {
      if (patch.limit === DEFAULT_QUEUE_PAGE_SIZE) params.delete('limit')
      else params.set('limit', String(patch.limit))
    }
    const page = patch.page ?? 1
    if (page > 1) params.set('page', String(page))
    else params.delete('page')
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <div className="editorial__pagination" data-testid="queue-pagination">
      <Pagination
        hasNextPage={info.hasNextPage}
        hasPrevPage={info.hasPrevPage}
        nextPage={info.nextPage ?? undefined}
        prevPage={info.prevPage ?? undefined}
        page={info.page}
        totalPages={info.totalPages}
        limit={info.limit}
        onChange={(page) => go({ page, limit: info.limit })}
      />
      <span className="editorial__muted">
        {info.page} / {info.totalPages} sahifa
      </span>
      <PerPage
        limit={info.limit}
        limits={[...QUEUE_PAGE_SIZES]}
        defaultLimit={DEFAULT_QUEUE_PAGE_SIZE}
        handleChange={(limit) => go({ limit, page: 1 })}
      />
    </div>
  )
}
