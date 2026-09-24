/**
 * "O'xshash maqolalar" (TZ §12.3): muharrir tanlagani (`relatedPosts`) birinchi, keyin teg va
 * kategoriya kesishmasi bo'yicha. Yon ta'sirsiz — unit testlanadi.
 *
 * Ball: har bir umumiy teg — 2, bir xil kategoriya — 1. Teng ballda yangirog'i oldinda.
 */
type Id = number | string

export type RelatedCandidate = {
  id: Id
  categoryId: Id | null
  tagIds: Id[]
  /** ISO 8601 */
  publishedAt: string
}

export const RELATED_LIMIT = 3

export function relatedScore(
  base: Pick<RelatedCandidate, 'categoryId' | 'tagIds'>,
  candidate: RelatedCandidate,
): number {
  const baseTags = new Set(base.tagIds.map(String))
  const sharedTags = candidate.tagIds.filter((id) => baseTags.has(String(id))).length
  const sameCategory =
    base.categoryId !== null && String(base.categoryId) === String(candidate.categoryId) ? 1 : 0
  return sharedTags * 2 + sameCategory
}

/**
 * @param manualIds — muharrir tanlagan postlar (tartib saqlanadi, faqat nomzodlar ichida bo'lsa)
 * @returns tanlangan nomzodlar id'lari (`limit` tagacha, o'zi va takrorlarsiz)
 */
export function rankRelated(
  base: Pick<RelatedCandidate, 'id' | 'categoryId' | 'tagIds'>,
  candidates: RelatedCandidate[],
  manualIds: Id[] = [],
  limit = RELATED_LIMIT,
): Id[] {
  const byId = new Map(candidates.map((candidate) => [String(candidate.id), candidate]))
  const result: Id[] = []
  const seen = new Set<string>([String(base.id)])
  const push = (id: Id) => {
    const key = String(id)
    if (seen.has(key) || result.length >= limit) return
    seen.add(key)
    result.push(byId.get(key)?.id ?? id)
  }

  for (const id of manualIds) if (byId.has(String(id))) push(id)

  const scored = candidates
    .map((candidate) => ({ candidate, score: relatedScore(base, candidate) }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.candidate.publishedAt).getTime() - new Date(a.candidate.publishedAt).getTime(),
    )
  for (const { candidate } of scored) push(candidate.id)
  return result
}
