import type { AdminViewServerProps, PayloadRequest } from 'payload'

import type { Post } from '@/payload-types'

import { EditorialShell } from './EditorialShell'
import { formatAdminDate, relName } from './utils'

const REVIEW_LIMIT = 200

/**
 * "Review" navbati (TZ §6.1, TASKS M2-04) — `/admin/review`: `workflowStatus = review` postlar.
 * AI agent (MCP) yuborganlari (`rewrittenBy = ai_agent`) belgi bilan, `notesForEditor` ko'rinadi.
 */
export function ReviewQueueView(props: AdminViewServerProps) {
  return (
    <EditorialShell props={props} path="/review" label="Tekshiruv (review)">
      <ReviewQueue req={props.initPageResult.req} />
    </EditorialShell>
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
