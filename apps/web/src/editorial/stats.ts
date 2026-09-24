import type { Payload, TypedUser, Where } from 'payload'

import { dayRange, localDate } from './queue'

/**
 * Dashboard vidjeti (TASKS M2-04): bugungi (Toshkent vaqti) tahririyat raqamlari.
 *
 * - `scraped`   — bugun yig'ilgan `scraped-items` (`createdAt`);
 * - `drafts`    — bugun yaratilgan postlar, hozir `draft` / `in_progress` holatida;
 * - `review`    — hozir tekshiruvda turgan postlar (sanadan qat'i nazar — bu navbat);
 * - `published` — bugun chop etilgan postlar (`publishedAt`).
 */
export interface EditorialStats {
  date: string
  scraped: number
  drafts: number
  review: number
  published: number
}

export async function getEditorialStats(
  payload: Payload,
  user: TypedUser | null,
  now: Date = new Date(),
): Promise<EditorialStats> {
  const date = localDate(now)
  const { from, to } = dayRange(date)
  const access = { overrideAccess: false, user } as const
  // Postlar — drafts yoqilgan: admin'dagi holat o'zgarishlari (autosave) avval versiyalarga
  // yoziladi, shuning uchun eng so'nggi versiyalar bo'yicha sanaymiz (`draft: true`).
  const countPosts = async (where: Where) =>
    (await payload.find({ collection: 'posts', where, draft: true, limit: 1, depth: 0, ...access }))
      .totalDocs
  const [scraped, drafts, review, published] = await Promise.all([
    payload.count({
      collection: 'scraped-items',
      where: {
        and: [{ createdAt: { greater_than_equal: from } }, { createdAt: { less_than: to } }],
      },
      ...access,
    }),
    countPosts({
      and: [
        { createdAt: { greater_than_equal: from } },
        { createdAt: { less_than: to } },
        { workflowStatus: { in: ['draft', 'in_progress'] } },
      ],
    }),
    countPosts({ workflowStatus: { equals: 'review' } }),
    countPosts({
      and: [
        { workflowStatus: { equals: 'published' } },
        { publishedAt: { greater_than_equal: from } },
        { publishedAt: { less_than: to } },
      ],
    }),
  ])
  return { date, scraped: scraped.totalDocs, drafts, review, published }
}
