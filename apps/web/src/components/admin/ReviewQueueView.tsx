import type { AdminViewServerProps, PayloadRequest } from 'payload'

import { postEditUrl } from '@/editorial/endpoints'
import { formatWordDelta, type RevisionChange } from '@/editorial/revisionDiff'
import { listPendingRevisions } from '@/editorial/revisions'
import type { Post } from '@/payload-types'

import { EditorialShell } from './EditorialShell'
import { RevisionActions } from './RevisionActions'
import { formatAdminDate, relName } from './utils'

const REVIEW_LIMIT = 200

/**
 * "Review" navbati (TZ §6.1, TASKS M2-04) — `/admin/review`: `workflowStatus = review` postlar.
 * AI agent (MCP) yuborganlari (`rewrittenBy = ai_agent`) belgi bilan, `notesForEditor` ko'rinadi.
 * Pastda — chop etilgan postlardagi kutilayotgan o'zgarishlar (OBLOG-64, `#revisions`).
 */
export function ReviewQueueView(props: AdminViewServerProps) {
  return (
    <EditorialShell props={props} path="/review" label="Tekshiruv (review)">
      <ReviewQueue req={props.initPageResult.req} />
      <PendingRevisions req={props.initPageResult.req} />
    </EditorialShell>
  )
}

function ChangeLine({ change }: { change: RevisionChange }) {
  if (change.words) {
    return (
      <li>
        <strong>{change.label}:</strong> matn oʻzgargan ({change.words.from} → {change.words.to}{' '}
        soʻz, {formatWordDelta(change.words.delta)})
      </li>
    )
  }
  if (change.from !== undefined || change.to !== undefined) {
    const short = (value: string | undefined) =>
      value ? (value.length > 160 ? `${value.slice(0, 159)}…` : value) : '—'
    return (
      <li>
        <strong>{change.label}:</strong> <del>{short(change.from)}</del> →{' '}
        <ins>{short(change.to)}</ins>
      </li>
    )
  }
  return (
    <li>
      <strong>{change.label}:</strong> oʻzgargan
    </li>
  )
}

/**
 * Chop etilgan postlardagi kutilayotgan o'zgarishlar (OBLOG-64): admin MCP kaliti tuzatib
 * `submit_for_review` qilgan, lekin chop etilmagan qoralama versiyalar. Saytdagi sahifa hali eski.
 */
async function PendingRevisions({ req }: { req: PayloadRequest }) {
  const { payload } = req
  const adminRoute = payload.config.routes.admin
  const apiRoute = payload.config.routes.api
  const { rows, totalDocs } = await listPendingRevisions(req)

  return (
    <section
      id="revisions"
      className="editorial__section"
      data-testid="revisions-section"
      aria-labelledby="revisions-title"
    >
      <header className="editorial__header">
        <h2 id="revisions-title">Chop etilgan postlardagi oʻzgarishlar</h2>
        <span className="editorial__muted" data-testid="revisions-total">
          {totalDocs} ta oʻzgarish tekshiruvni kutmoqda · saytdagi sahifa chop etilguncha
          oʻzgarmaydi
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="editorial__empty">Kutilayotgan oʻzgarish yoʻq.</p>
      ) : (
        <div className="editorial__list" data-testid="revisions-list">
          {rows.map((row) => {
            const editUrl = postEditUrl(adminRoute, row.id)
            const titleChanged = row.liveTitle !== null && row.liveTitle !== row.title
            const who = row.submittedBy
              ? row.submittedBy.name || row.submittedBy.email || `user #${row.submittedBy.id}`
              : '—'
            return (
              <article
                key={row.id}
                className="editorial__row"
                data-testid="revision-item"
                data-post-id={row.id}
                style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}
              >
                <div>
                  <h3 className="editorial__title">
                    <a href={editUrl}>{row.title}</a>
                  </h3>
                  <div className="editorial__meta">
                    <span className="editorial__pill editorial__pill--revision">
                      Chop etilgan · oʻzgarish
                    </span>
                    <span>Yubordi: {who}</span>
                    <span>Yuborilgan: {formatAdminDate(row.submittedAt)}</span>
                    {titleChanged && <span>Saytda: “{row.liveTitle}”</span>}
                  </div>
                  {row.changes.length > 0 ? (
                    <ul className="editorial__changes" data-testid="revision-changes">
                      {row.changes.map((change) => (
                        <ChangeLine key={change.field} change={change} />
                      ))}
                    </ul>
                  ) : (
                    <p className="editorial__muted">
                      Asosiy maydonlarda farq topilmadi — postni ochib tekshiring.
                    </p>
                  )}
                  {row.notesForEditor && (
                    <p className="editorial__notes" data-testid="notes-for-editor">
                      {row.notesForEditor}
                    </p>
                  )}
                </div>
                <RevisionActions apiRoute={apiRoute} postId={row.id} editUrl={editUrl} />
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

async function ReviewQueue({ req }: { req: PayloadRequest }) {
  const { payload } = req
  const adminRoute = payload.config.routes.admin
  // Drafts: admin'dagi holat o'zgarishi (autosave) avval versiyaga yoziladi — `draft: true`.
  const { docs, totalDocs } = await payload.find({
    collection: 'posts',
    where: { workflowStatus: { equals: 'review' } },
    draft: true,
    sort: '-updatedAt',
    limit: REVIEW_LIMIT,
    depth: 1,
    select: {
      title: true,
      category: true,
      assignee: true,
      rewrittenBy: true,
      notesForEditor: true,
      sources: true,
      updatedAt: true,
    },
    populate: {
      categories: { name: true },
      users: { name: true },
    },
    overrideAccess: false,
    req,
  })
  const posts = docs as Post[]

  return (
    <>
      <header className="editorial__header">
        <h1>Tekshiruv navbati</h1>
        <span className="editorial__muted" data-testid="review-total">
          {totalDocs} ta post tekshiruvni kutmoqda
        </span>
      </header>
      {posts.length === 0 ? (
        <p className="editorial__empty">Tekshiruvda post yo‘q.</p>
      ) : (
        <div className="editorial__list" data-testid="review-list">
          {posts.map((post) => {
            const byAgent = post.rewrittenBy === 'ai_agent'
            const source = post.sources?.[0]
            return (
              <article
                key={post.id}
                className="editorial__row"
                data-testid="review-item"
                style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}
              >
                <div>
                  <h2 className="editorial__title">
                    <a href={`${adminRoute}/collections/posts/${post.id}`}>{post.title}</a>
                  </h2>
                  <div className="editorial__meta">
                    {byAgent ? (
                      <span className="editorial__pill editorial__pill--agent">AI agent</span>
                    ) : (
                      <span className="editorial__pill">Inson</span>
                    )}
                    {relName(post.category) && <span>{relName(post.category)}</span>}
                    <span>Mas’ul: {relName(post.assignee) ?? '—'}</span>
                    <span>Yangilangan: {formatAdminDate(post.updatedAt)}</span>
                    {source?.url && (
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        Manba: {source.name || source.url}
                      </a>
                    )}
                  </div>
                  {post.notesForEditor?.trim() && (
                    <p className="editorial__notes" data-testid="notes-for-editor">
                      {post.notesForEditor}
                    </p>
                  )}
                </div>
                <div className="editorial__actions" style={{ minWidth: 0 }}>
                  <a className="editorial__btn" href={`${adminRoute}/collections/posts/${post.id}`}>
                    Tekshirish
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
