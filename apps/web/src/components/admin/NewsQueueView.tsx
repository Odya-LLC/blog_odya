import type { AdminViewServerProps, PayloadRequest } from 'payload'

import { SCRAPED_ITEM_STATUSES, type ScrapedItemStatus } from '@/collections/ScrapedItems'
import {
  buildQueueWhere,
  dayRange,
  groupByCluster,
  localDate,
  parseQueueFilters,
  QUEUE_STATUS_FILTER_LABELS,
  QUEUE_STATUS_FILTERS,
  type QueueFilters,
  scoringStatus,
} from '@/editorial/queue'
import type { ScrapedItem } from '@/payload-types'

import { EditorialShell } from './EditorialShell'
import { QueueItemActions } from './QueueItemActions'
import { formatAdminDate, relId, relName, snippet } from './utils'

/** Bir kunda ko'rsatiladigan elementlar chegarasi (5 manba × ~30/kun — yetarli zaxira bilan). */
const QUEUE_LIMIT = 500

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
 * Filtrlar URL'da (`?date=YYYY-MM-DD&status=new&source=1&category=2`), oddiy GET forma.
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

function queueHref(adminRoute: string, filters: QueueFilters, patch: Partial<QueueFilters>) {
  const next = { ...filters, ...patch }
  const params = new URLSearchParams({ date: next.date, status: next.status })
  if (next.source) params.set('source', String(next.source))
  if (next.category) params.set('category', String(next.category))
  return `${adminRoute}${PATH}?${params.toString()}`
}

async function NewsQueue({
  req,
  searchParams,
}: {
  req: PayloadRequest
  searchParams: AdminViewServerProps['searchParams']
}) {
  const { payload } = req
  const adminRoute = payload.config.routes.admin
  const apiRoute = payload.config.routes.api
  const filters = parseQueueFilters(searchParams as Record<string, string | string[] | undefined>)
  const today = localDate()
  const access = { overrideAccess: false, req } as const

  const [items, sources, categories] = await Promise.all([
    payload.find({
      collection: 'scraped-items',
      where: buildQueueWhere(filters),
      sort: '-createdAt',
      limit: QUEUE_LIMIT,
      depth: 1,
      select: {
        title: true,
        url: true,
        canonicalUrl: true,
        source: true,
        status: true,
        score: true,
        clusterId: true,
        publishedAt: true,
        language: true,
        excerpt: true,
        extractedText: true,
        wordCount: true,
        suggestedCategory: true,
        post: true,
        rejectReason: true,
        createdAt: true,
      },
      populate: {
        sources: { name: true },
        categories: { name: true },
        posts: { title: true },
      },
      ...access,
    }),
    payload.find({
      collection: 'sources',
      sort: 'name',
      limit: 100,
      depth: 0,
      select: { name: true },
      ...access,
    }),
    payload.find({
      collection: 'categories',
      sort: 'name',
      limit: 200,
      depth: 0,
      select: { name: true },
      ...access,
    }),
  ])

  const docs = items.docs as ScrapedItem[]
  const groups = groupByCluster(docs)
  const { hasScore, hasClusters } = scoringStatus(docs)
  const categoryOptions = categories.docs.map((c) => ({ id: c.id, name: c.name }))

  return (
    <>
      <header className="editorial__header">
        <h1>Yangiliklar navbati</h1>
        <span className="editorial__muted" data-testid="queue-total">
          {filters.date === today ? 'Bugun' : filters.date}: {items.totalDocs} ta element
          {items.totalDocs > docs.length ? ` (ko‘rsatilgan: ${docs.length})` : ''}
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
            {sources.docs.map((source) => (
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
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="editorial__btn">
          Ko‘rsatish
        </button>
        <nav className="editorial__day-nav" aria-label="Kunlar">
          <a href={queueHref(adminRoute, filters, { date: shiftDate(filters.date, -1) })}>
            ← Oldingi kun
          </a>
          {filters.date !== today && (
            <>
              <a href={queueHref(adminRoute, filters, { date: shiftDate(filters.date, 1) })}>
                Keyingi kun →
              </a>
              <a href={queueHref(adminRoute, filters, { date: today })}>Bugun</a>
            </>
          )}
        </nav>
      </form>

      {docs.length > 0 && (!hasScore || !hasClusters) && (
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
                    categories={categoryOptions}
                  />
                ))}
              </section>
            ) : (
              <QueueRow
                key={group.key}
                item={group.items[0]}
                adminRoute={adminRoute}
                apiRoute={apiRoute}
                categories={categoryOptions}
              />
            ),
          )}
        </div>
      )}
    </>
  )
}

function QueueRow({
  item,
  adminRoute,
  apiRoute,
  categories,
}: {
  item: ScrapedItem
  adminRoute: string
  apiRoute: string
  categories: { id: number; name: string }[]
}) {
  const status = (SCRAPED_ITEM_STATUSES as readonly string[]).includes(item.status)
    ? item.status
    : 'pending'
  const text = snippet(item.extractedText || item.excerpt)
  const url = item.canonicalUrl || item.url
  return (
    <article className="editorial__row" data-testid="queue-item" data-item-id={item.id}>
      <div className="editorial__score" title="Score (0–100)">
        {typeof item.score === 'number' ? Math.round(item.score) : '—'}
        <small>score</small>
      </div>
      <div>
        <h2 className="editorial__title">
          <a href={url} target="_blank" rel="noopener noreferrer">
            {item.title || url}
          </a>
        </h2>
        <div className="editorial__meta">
          <span>{relName(item.source) ?? 'Manba'}</span>
          {item.language && <span>{item.language.toUpperCase()}</span>}
          <span title="Manbada chop etilgan">
            {formatAdminDate(item.publishedAt ?? item.createdAt)}
          </span>
          {relName(item.suggestedCategory) && <span>→ {relName(item.suggestedCategory)}</span>}
          {item.wordCount ? <span>{item.wordCount} so‘z</span> : null}
          <span
            className={`editorial__pill${status === 'rejected' ? ' editorial__pill--rejected' : ''}`}
          >
            {STATUS_LABELS[status]}
          </span>
          <a href={`${adminRoute}/collections/scraped-items/${item.id}`}>Batafsil</a>
        </div>
        {text && <p className="editorial__excerpt">{text}</p>}
        {status === 'rejected' && item.rejectReason && (
          <p className="editorial__notes">Rad etish sababi: {item.rejectReason}</p>
        )}
      </div>
      <QueueItemActions
        apiRoute={apiRoute}
        itemId={item.id}
        status={status}
        postTitle={relName(item.post, 'title')}
        postUrl={relId(item.post) ? `${adminRoute}/collections/posts/${relId(item.post)}` : null}
        suggestedCategoryId={relId(item.suggestedCategory)}
        categories={categories}
      />
    </article>
  )
}
