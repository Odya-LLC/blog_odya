import { describe, expect, it } from 'vitest'

import { rankRelated, relatedScore, type RelatedCandidate } from '@/site/related'

const at = (day: number) => `2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`

const base = { id: 1, categoryId: 10, tagIds: [100, 101] }

const candidates: RelatedCandidate[] = [
  { id: 2, categoryId: 10, tagIds: [], publishedAt: at(20) }, // 1
  { id: 3, categoryId: 11, tagIds: [100], publishedAt: at(19) }, // 2
  { id: 4, categoryId: 10, tagIds: [100, 101], publishedAt: at(10) }, // 5
  { id: 5, categoryId: 12, tagIds: [999], publishedAt: at(23) }, // 0
  { id: 6, categoryId: 10, tagIds: [], publishedAt: at(22) }, // 1 (yangiroq)
  { id: 1, categoryId: 10, tagIds: [100, 101], publishedAt: at(24) }, // o'zi
]

describe("o'xshash postlar (teg/kategoriya kesishmasi)", () => {
  it('ball: umumiy teg ×2 + bir xil kategoriya', () => {
    expect(relatedScore(base, candidates[0]!)).toBe(1)
    expect(relatedScore(base, candidates[1]!)).toBe(2)
    expect(relatedScore(base, candidates[2]!)).toBe(5)
    expect(relatedScore(base, candidates[3]!)).toBe(0)
  })

  it('ball bo‘yicha, teng ballda yangirog‘i; o‘zi va aloqasizlar chiqmaydi', () => {
    expect(rankRelated(base, candidates, [], 10)).toEqual([4, 3, 6, 2])
  })

  it('limit', () => {
    expect(rankRelated(base, candidates)).toEqual([4, 3, 6])
  })

  it('muharrir tanlagani birinchi (nomzodlar ichida bo‘lsa), takrorlanmaydi', () => {
    expect(rankRelated(base, candidates, [5, 2, 777, 1], 4)).toEqual([5, 2, 4, 3])
  })

  it('id turi (string/number) farqi e’tiborsiz', () => {
    expect(
      rankRelated({ id: '1', categoryId: '10', tagIds: ['100'] }, candidates, ['6'], 2),
    ).toEqual([6, 4])
  })
})
