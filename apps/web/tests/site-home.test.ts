import { describe, expect, it } from 'vitest'

import type { CategoryRef, PostSummary, TagRef } from '@/components/blog/types'
import {
  buildHomeSections,
  groupSectionRows,
  HOME_FEED_COUNT,
  HOME_LAYOUT_CYCLE,
  HOME_LAYOUT_SIZE,
  HOME_TOP_COUNT,
  pickSectionPosts,
  splitLatest,
  trendingTags,
} from '@/site/home'

/** Bosh sahifa kompozitsiyasi (OBLOG-68): eng so'nggisi birinchi, bo'limlar takrorlanmaydi. */
function category(slug: string): CategoryRef {
  return { slug, name: slug, href: `/${slug}` }
}

const BASE = Date.parse('2026-10-01T12:00:00Z')

/** `n` — qanchalik yangi (katta — yangiroq). */
function post(id: number, cat: string, minutesAgo = id): PostSummary {
  return {
    id,
    title: `Post ${id}`,
    href: `/${cat}/post-${id}`,
    category: category(cat),
    publishedAt: new Date(BASE - minutesAgo * 60_000).toISOString(),
  }
}

describe('splitLatest', () => {
  it('1 katta + 4 + lenta (12), tartib saqlanadi', () => {
    const latest = Array.from({ length: 30 }, (_, i) => post(i + 1, 'ai'))
    const top = splitLatest(latest)
    expect(top.lead?.id).toBe(1)
    expect(top.top.map((p) => p.id)).toEqual([2, 3, 4, 5])
    expect(top.feed).toHaveLength(HOME_FEED_COUNT)
    expect(top.feed[0]?.id).toBe(HOME_TOP_COUNT + 1)
  })

  it('bo‘sh ro‘yxat — lead yo‘q', () => {
    expect(splitLatest([])).toEqual({ lead: null, top: [], feed: [] })
  })
})

describe('pickSectionPosts', () => {
  const candidates = [post(1, 'ai'), post(2, 'ai'), post(3, 'ai'), post(4, 'ai'), post(5, 'ai')]

  it('yuqori blokdagilar hech qachon, lentadagilar — faqat yetmasa', () => {
    const picked = pickSectionPosts(candidates, new Set([1]), new Set([2, 3]), 3)
    // Yangi (4, 5) + yetmaganiga lentadan eng yangisi (2), xronologik tartibda.
    expect(picked.map((p) => p.id)).toEqual([2, 4, 5])
  })

  it('yangilari yetarli bo‘lsa lentadagilar olinmaydi', () => {
    const picked = pickSectionPosts(candidates, new Set(), new Set([1]), 3)
    expect(picked.map((p) => p.id)).toEqual([2, 3, 4])
  })
})

describe('buildHomeSections', () => {
  it('yuqori blok takrorlanmaydi, bo‘sh kategoriya tashlanadi, eng yangisi birinchi, ko‘rinishlar navbat bilan', () => {
    const top = splitLatest([post(1, 'ai'), post(2, 'ai'), post(3, 'games')])
    const sections = buildHomeSections(
      [
        // Tahririyat tartibi: ai, games, empty, esports, gadgets, code, science
        { category: category('ai'), posts: [post(1, 'ai'), post(2, 'ai'), post(10, 'ai')] },
        {
          category: category('games'),
          posts: [post(3, 'games'), post(20, 'games'), post(21, 'games')],
        },
        { category: category('empty'), posts: [] },
        {
          category: category('esports'),
          posts: [post(4, 'esports'), post(5, 'esports'), post(6, 'esports')],
        },
        { category: category('gadgets'), posts: [post(30, 'gadgets'), post(31, 'gadgets')] },
        { category: category('code'), posts: [post(40, 'code'), post(41, 'code')] },
        { category: category('science'), posts: [post(50, 'science'), post(51, 'science')] },
      ],
      top,
    )
    // `ai`: 1, 2 — yuqorida, faqat 10 qoladi (< 2) — tashlanadi.
    expect(sections.map((s) => s.category.slug)).toEqual([
      'games',
      'esports',
      'gadgets',
      'code',
      'science',
    ])
    expect(sections.map((s) => s.layout)).toEqual(HOME_LAYOUT_CYCLE.slice(0, 5))
    expect(sections[0]?.posts.map((p) => p.id)).toEqual([20, 21])
    for (const section of sections) {
      expect(section.posts.length).toBeLessThanOrEqual(HOME_LAYOUT_SIZE[section.layout])
    }
  })

  it('ketma-ket "headlines" bo‘limlari juftlanadi', () => {
    const make = (slug: string, layout: (typeof HOME_LAYOUT_CYCLE)[number]) => ({
      category: category(slug),
      layout,
      posts: [],
    })
    const rows = groupSectionRows([
      make('a', 'feature'),
      make('b', 'grid'),
      make('c', 'headlines'),
      make('d', 'headlines'),
      make('e', 'headlines'),
      make('f', 'strip'),
    ])
    expect(rows.map((row) => row.map((s) => s.category.slug))).toEqual([
      ['a'],
      ['b'],
      ['c', 'd'],
      ['e'],
      ['f'],
    ])
  })
})

describe('trendingTags', () => {
  const tag = (slug: string): TagRef => ({ slug, name: slug.toUpperCase(), href: `/tag/${slug}` })

  it('kamida minCount marta uchraganlar, ko‘pidan kamiga; takror teg bitta postda bir marta', () => {
    const result = trendingTags(
      [
        [tag('cs2'), tag('ai'), tag('ai')],
        [tag('ai'), tag('iphone')],
        [tag('cs2'), tag('ai')],
        [tag('cs2')],
      ],
      3,
      10,
    )
    expect(result.map((t) => t.slug)).toEqual(['cs2', 'ai'])
  })
})
