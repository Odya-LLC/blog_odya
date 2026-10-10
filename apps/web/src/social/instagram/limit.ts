import type { Payload } from 'payload'

import type { MakeConfig } from '../make/config'
import { INSTAGRAM_SCRIPT, type StoryBudget, storyBudget } from './digestPayload'

const DAY_MS = 24 * 60 * 60_000

/**
 * Oxirgi 24 soatdagi Instagram nashrlari (OBLOG-118, lotin yozuvi — bitta hisob): `social-deliveries`
 * dagi yuborilgan story va alohida postlar (`post.story`, `post.published`) + yuborilgan dayjest
 * karusellari (`instagram-digests`, `format = carousel`; bitta postli dayjest — `post.published`
 * qatori sifatida hisoblangan).
 */
export async function instagramUsage(
  payload: Payload,
  now: number,
): Promise<{ used: number; digestsSent: number }> {
  const since = new Date(now - DAY_MS).toISOString()
  const [posts, digests] = await Promise.all([
    payload.count({
      collection: 'social-deliveries',
      where: {
        and: [
          { script: { equals: INSTAGRAM_SCRIPT } },
          { status: { equals: 'sent' } },
          { event: { in: ['post.published', 'post.story'] } },
          { sentAt: { greater_than: since } },
        ],
      },
      overrideAccess: true,
    }),
    payload.count({
      collection: 'instagram-digests',
      where: {
        and: [
          { status: { equals: 'sent' } },
          { format: { equals: 'carousel' } },
          { sentAt: { greater_than: since } },
        ],
      },
      overrideAccess: true,
    }),
  ])
  return { used: posts.totalDocs + digests.totalDocs, digestsSent: digests.totalDocs }
}

/** Shu post story'si kunlik limitga sig'adimi (`storyBudget` qoidasi). */
export async function checkStoryBudget(
  payload: Payload,
  options: { config: MakeConfig; priority: number; now: number },
): Promise<StoryBudget & { used: number }> {
  const usage = await instagramUsage(payload, options.now)
  return {
    ...storyBudget({
      used: usage.used,
      digestsSent: usage.digestsSent,
      digestSlots: options.config.instagramDigestTimes.length,
      limit: options.config.instagramDailyLimit,
      priority: options.priority,
    }),
    used: usage.used,
  }
}
