import type { ServerProps } from 'payload'

import { isAdminOrEditorUser } from '@/access'
import { getEditorialStats } from '@/editorial/stats'

import './editorial.css'

/**
 * Dashboard vidjeti (TASKS M2-04, `admin.components.beforeDashboard`): bugun yig'ilgan /
 * qoralama / tekshiruvda / chop etilgan — har biri tegishli ro'yxatga havola.
 */
export async function EditorialStats({ payload, user }: ServerProps) {
  if (!isAdminOrEditorUser(user)) return null
  const stats = await getEditorialStats(payload, user ?? null)
  const admin = payload.config.routes.admin
  const posts = `${admin}/collections/posts`
  const cards = [
    { key: 'scraped', label: 'Bugun yig‘ilgan', value: stats.scraped, href: `${admin}/news-queue` },
    {
      key: 'drafts',
      label: 'Bugungi qoralamalar',
      value: stats.drafts,
      href: `${posts}?where[workflowStatus][in][0]=draft&where[workflowStatus][in][1]=in_progress`,
    },
    { key: 'review', label: 'Tekshiruvda', value: stats.review, href: `${admin}/review` },
    {
      key: 'published',
      label: 'Bugun chop etilgan',
      value: stats.published,
      href: `${posts}?where[workflowStatus][equals]=published`,
    },
  ]
  return (
    <section
      className="editorial-stats"
      aria-label="Tahririyat — bugun"
      data-testid="editorial-stats"
    >
      <h2 className="editorial-stats__title">Tahririyat — bugun ({stats.date})</h2>
      <div className="editorial-stats__grid">
        {cards.map((card) => (
          <a key={card.key} className="editorial-stats__card" href={card.href} data-stat={card.key}>
            <span className="editorial-stats__value">{card.value}</span>
            <span className="editorial-stats__label">{card.label}</span>
          </a>
        ))}
      </div>
    </section>
  )
}
