import type { AdminViewServerProps, PayloadRequest } from 'payload'

import type { ScrapedItemStatus } from '@/collections/ScrapedItems'
import {
  dayRange,
  DEFAULT_QUEUE_PAGE_SIZE,
  localDate,
  parseQueueFilters,
  parseQueuePagination,
  QUEUE_STATUS_FILTER_LABELS,
  QUEUE_STATUS_FILTERS,
  type QueueFilters,
  queueSearchParams,
} from '@/editorial/queue'
import {
  loadQueuePage,
  QUEUE_SCAN_LIMIT,
  type QueueOption,
  type QueueRowItem,
} from '@/editorial/queuePage'

import { EditorialShell } from './EditorialShell'
import { QueueItemActions } from './QueueItemActions'
import { QueuePagination } from './QueuePagination'
import { formatAdminDate } from './utils'

const STATUS_LABELS: Record<ScrapedItemStatus, string> = {
  pending: 'Navbatda',
  scraped: 'Yig‘ilgan',
  drafted: 'Qoralamaga olingan',
  rejected: 'Rad etilgan',
  duplicate: 'Dublikat',
  error: 'Xato',
}

const PATH = '/news-queue'

/**
 * "Yangiliklar navbati" (TZ §6.1, TASKS M2-04) — `/admin/news-queue`.
 * Filtrlar URL'da (`?date=YYYY-MM-DD&status=new&source=1&category=2`), oddiy GET forma;
 * sahifalash — `?page=2&limit=50` (klaster guruhlari bo'yicha; filtr o'zgarsa — 1-sahifa).
 */
export function NewsQueueView(props: AdminViewServerProps) {
  return (
    <EditorialShell props={props} path={PATH} label="Yangiliklar navbati">
      <NewsQueue req={props.initPageResult.req} searchParams={props.searchParams} />
    </EditorialShell>
  )
}

function shiftDate(date: string, days: number): string {
  const { from } = dayRange(date)
  return localDate(new Date(new Date(from).getTime() + days * 24 * 60 * 60 * 1000 + 60_000))
}

/** Kun navigatsiyasi havolalari: filtrlar saqlanadi, sahifa 1 ga qaytadi (limit saqlanadi). */
function queueHref(
  adminRoute: string,
  filters: QueueFilters,
  patch: Partial<QueueFilters>,
  limit: number,
) {
  return `${adminRoute}${PATH}?${queueSearchParams({ ...filters, ...patch }, { limit }).toString()}`
}

async function NewsQueue({
  req,
  searchParams,
}: {
  req: PayloadRequest
  searchParams: AdminViewServerProps['searchParams']
}) {
  const adminRoute = req.payload.config.routes.admin
  const apiRoute = req.payload.config.routes.api
  const params = searchParams as Record<string, string | string[] | undefined>
  const filters = parseQueueFilters(params)
  const pagination = parseQueuePagination(params)
  const today = localDate()

  const data = await loadQueuePage({ req, filters, pagination })
  const { groups, pageInfo, totalDocs, hasScore, hasClusters, categories } = data
  const shown = groups.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <>
      <header className="editorial__header">
        <h1>Yangiliklar navbati</h1>
        <span className="editorial__muted" data-testid="queue-total">
          {filters.date === today ? 'Bugun' : filters.date}: {totalDocs} ta element
          {pageInfo.totalPages > 1
            ? ` · ${pageInfo.page}/${pageInfo.totalPages}-sahifa (ko‘rsatilgan: ${shown})`
            : ''}
        </span>
      </header>

      <form className="editorial__filters" method="get" action={`${adminRoute}${PATH}`}>
        <label>
          Sana
          <input type="date" name="date" defaultValue={filters.date} max={today} />
        </label>
        <label>
          Holat
          <select name="status" defaultValue={filters.status}>
            {QUEUE_STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {QUEUE_STATUS_FILTER_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Manba
          <select name="source" defaultValue={filters.source ? String(filters.source) : ''}>
            <option value="">Hammasi</option>
            {data.sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kategoriya
          <select name="category" defaultValue={filters.category ? String(filters.category) : ''}>
            <option value="">Hammasi</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        {/* Filtr yuborilganda `page` yo'q — 1-sahifa; tanlangan sahifa hajmi saqlanadi. */}
        {pagination.limit !== DEFAULT_QUEUE_PAGE_SIZE && (
          <input type="hidden" name="limit" value={pagination.limit} />
        )}
        <button type="submit" className="editorial__btn">
          Ko‘rsatish
        </button>
        <nav className="editorial__day-nav" aria-label="Kunlar">
          <a
            href={queueHref(
              adminRoute,
              filters,
              { date: shiftDate(filters.date, -1) },
              pagination.limit,
            )}
          >
            ← Oldingi kun
          </a>
          {filters.date !== today && (
            <>
              <a
                href={queueHref(
                  adminRoute,
                  filters,
                  { date: shiftDate(filters.date, 1) },
                  pagination.limit,
                )}
              >
                Keyingi kun →
              </a>
              <a href={queueHref(adminRoute, filters, { date: today }, pagination.limit)}>Bugun</a>
            </>
          )}
        </nav>
      </form>

      {data.truncated && (
        <p className="editorial__notice" data-testid="queue-truncated">
          Bu kunda {totalDocs} ta element — faqat eng yangi {QUEUE_SCAN_LIMIT} tasi ko‘rsatilmoqda.
          Filtrlar bilan toraytiring.
        </p>
      )}

      {totalDocs > 0 && (!hasScore || !hasClusters) && (
        <p className="editorial__notice" data-testid="scoring-notice">
          {!hasScore &&
            'Score hali hisoblanmagan — navbat eng yangi yangiliklar bo‘yicha saralangan. '}
          {!hasClusters &&
            'Klasterlar (dublikat guruhlari) hali aniqlanmagan — har element alohida. '}
          <span className="editorial__muted">
            (item.dedupe / item.classify — matn ajratilgandan keyin hisoblanadi)
          </span>
        </p>
      )}

      {groups.length === 0 ? (
        <p className="editorial__empty">Bu kun uchun tanlangan filtrlar bo‘yicha element yo‘q.</p>
      ) : (
        <div className="editorial__list" data-testid="queue-list">
          {groups.map((group) =>
            group.items.length > 1 ? (
              <section key={group.key} className="editorial__cluster" aria-label="Klaster">
                <span className="editorial__cluster-title">
                  Klaster · {group.items.length} ta manba bir xil voqea haqida
                </span>
                {group.items.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    adminRoute={adminRoute}
                    apiRoute={apiRoute}
                    categories={categories}
                  />
                ))}
              </section>
            ) : (
              <QueueRow
                key={group.key}
                item={group.items[0]}
                adminRoute={adminRoute}
                apiRoute={apiRoute}
                categories={categories}
              />
            ),
          )}
        </div>
      )}

      {totalDocs > 0 && <QueuePagination info={pageInfo} />}
    </>
  )
}

function QueueRow({
  item,
  adminRoute,
  apiRoute,
  categories,
}: {
  item: QueueRowItem
  adminRoute: string
  apiRoute: string
  categories: QueueOption[]
}) {
  const { status } = item
  return (
    <article className="editorial__row" data-testid="queue-item" data-item-id={item.id}>
      <div className="editorial__score" title="Score (0–100)">
        {typeof item.score === 'number' ? Math.round(item.score) : '—'}
        <small>score</small>
      </div>
      <div>
        <h2 className="editorial__title">
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            {item.title || item.url}
          </a>
        </h2>
        <div className="editorial__meta">
          <span>{item.source?.name || 'Manba'}</span>
          {item.language && <span>{item.language.toUpperCase()}</span>}
          <span title="Manbada chop etilgan">
            {formatAdminDate(item.publishedAt ?? item.createdAt)}
          </span>
          {item.suggestedCategory?.name && <span>→ {item.suggestedCategory.name}</span>}
          {item.wordCount ? <span>{item.wordCount} so‘z</span> : null}
          <span
            className={`editorial__pill${status === 'rejected' ? ' editorial__pill--rejected' : ''}`}
          >
            {STATUS_LABELS[status]}
          </span>
          <a href={`${adminRoute}/collections/scraped-items/${item.id}`}>Batafsil</a>
        </div>
        {item.text && <p className="editorial__excerpt">{item.text}</p>}
        {status === 'rejected' && item.rejectReason && (
          <p className="editorial__notes">Rad etish sababi: {item.rejectReason}</p>
        )}
      </div>
      <QueueItemActions
        apiRoute={apiRoute}
        itemId={item.id}
        status={status}
        postTitle={item.post?.title ?? null}
        postUrl={item.post ? `${adminRoute}/collections/posts/${item.post.id}` : null}
        suggestedCategoryId={item.suggestedCategory?.id ?? null}
        categories={categories}
      />
    </article>
  )
}
