import { describe, expect, it } from 'vitest'

import { baseSlugFor, buildDraftPostData } from '@/editorial/actions'
import {
  buildQueueWhere,
  compareQueueItems,
  dayRange,
  groupByCluster,
  isValidDate,
  localDate,
  parseQueueFilters,
  scoringStatus,
  type QueueItemLike,
} from '@/editorial/queue'
import type { ScrapedItem } from '@/payload-types'

/** Tahririyat navbati (M2-04) — sof yordamchilar. */
describe('editorial queue: sana (Toshkent, UTC+5)', () => {
  it('localDate — Toshkent sanasi (UTC 19:30 → ertasi kun)', () => {
    expect(localDate(new Date('2026-09-24T18:59:00Z'))).toBe('2026-09-24')
    expect(localDate(new Date('2026-09-24T19:00:00Z'))).toBe('2026-09-25')
  })

  it('dayRange — [00:00, 24:00) Toshkent vaqti, UTC ko‘rinishida', () => {
    expect(dayRange('2026-09-24')).toEqual({
      from: '2026-09-23T19:00:00.000Z',
      to: '2026-09-24T19:00:00.000Z',
    })
  })

  it('isValidDate — faqat mavjud YYYY-MM-DD', () => {
    expect(isValidDate('2026-09-24')).toBe(true)
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isValidDate('24.09.2026')).toBe(false)
    expect(isValidDate(undefined)).toBe(false)
  })
})

describe('editorial queue: filtrlar', () => {
  const now = new Date('2026-09-24T08:00:00Z')

  it('default — bugun, faqat yangi (ko‘rib chiqilmagan) elementlar', () => {
    expect(parseQueueFilters(undefined, now)).toEqual({
      date: '2026-09-24',
      status: 'new',
      source: undefined,
      category: undefined,
    })
  })

  it('noto‘g‘ri qiymatlar e‘tiborsiz qoldiriladi', () => {
    expect(
      parseQueueFilters({ date: 'kecha', status: 'hack', source: '-1', category: ['7', '8'] }, now),
    ).toEqual({ date: '2026-09-24', status: 'new', source: undefined, category: 7 })
  })

  it('buildQueueWhere — sana oralig‘i + holat/manba/kategoriya', () => {
    const range = dayRange('2026-09-20')
    expect(buildQueueWhere({ date: '2026-09-20', status: 'new', source: 3, category: 5 })).toEqual({
      and: [
        { createdAt: { greater_than_equal: range.from } },
        { createdAt: { less_than: range.to } },
        { status: { in: ['pending', 'scraped'] } },
        { source: { equals: 3 } },
        { suggestedCategory: { equals: 5 } },
      ],
    })
    const rejected = buildQueueWhere({ date: '2026-09-20', status: 'rejected' })
    expect(rejected.and).toContainEqual({ status: { equals: 'rejected' } })
    const all = buildQueueWhere({ date: '2026-09-20', status: 'all' })
    expect(JSON.stringify(all)).not.toContain('status')
  })
})

describe('editorial queue: saralash va klasterlar', () => {
  const item = (id: number, extra: Partial<QueueItemLike> = {}): QueueItemLike => ({
    id,
    createdAt: `2026-09-24T0${id}:00:00Z`,
    ...extra,
  })

  it('score kamayish tartibida, score yo‘qlari oxirida; teng bo‘lsa — yangilari birinchi', () => {
    const sorted = [
      item(1),
      item(2, { score: 40 }),
      item(3),
      item(4, { score: 80 }),
      item(5, { score: 40, publishedAt: '2026-09-24T09:00:00Z' }),
    ].sort(compareQueueItems)
    expect(sorted.map((i) => i.id)).toEqual([4, 5, 2, 3, 1])
  })

  it('score/klaster yo‘q (M2-03 gacha) — eng yangi birinchi, har element alohida guruh', () => {
    const items = [item(1), item(3), item(2)]
    const groups = groupByCluster(items)
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([[3], [2], [1]])
    expect(scoringStatus(items)).toEqual({ hasScore: false, hasClusters: false })
  })

  it('bir xil clusterId — bitta guruh, guruh eng yaxshi elementi bo‘yicha joylashadi', () => {
    const items = [
      item(1, { score: 10, clusterId: 'a' }),
      item(2, { score: 90 }),
      item(3, { score: 70, clusterId: 'a' }),
      item(4, { score: 95, clusterId: ' ' }),
    ]
    const groups = groupByCluster(items)
    expect(groups.map((g) => ({ cluster: g.clusterId, ids: g.items.map((i) => i.id) }))).toEqual([
      { cluster: null, ids: [4] },
      { cluster: null, ids: [2] },
      { cluster: 'a', ids: [3, 1] },
    ])
    expect(scoringStatus(items)).toEqual({ hasScore: true, hasClusters: true })
  })
})

describe('editorial: qoralama post ma‘lumotlari', () => {
  const scraped = {
    id: 42,
    title: '  OpenAI releases a new model  ',
    url: 'https://example.com/a?utm=1',
    canonicalUrl: 'https://example.com/a',
    source: { id: 1, name: 'Example News' },
    status: 'pending',
  } as unknown as ScrapedItem

  it('sources[] atributsiya, kategoriya, draft, assignee, human', () => {
    expect(buildDraftPostData(scraped, { categoryId: 5, userId: 9, slug: 's' })).toEqual({
      title: 'OpenAI releases a new model',
      slug: 's',
      category: 5,
      workflowStatus: 'draft',
      assignee: 9,
      rewrittenBy: 'human',
      sources: [{ name: 'Example News', url: 'https://example.com/a', scrapedItem: 42 }],
    })
  })

  it('manba nomi bo‘lmasa — domen; sarlavha bo‘lmasa — URL', () => {
    const data = buildDraftPostData(
      { ...scraped, title: null, canonicalUrl: null, source: 1 } as ScrapedItem,
      { categoryId: 5, userId: 9, slug: 's' },
    )
    expect(data.title).toBe('https://example.com/a?utm=1')
    expect(data.sources[0].name).toBe('example.com')
  })

  it('slug: lotin sarlavhadan, bo‘lmasa (kirill) — yangilik-<id>', () => {
    expect(baseSlugFor({ id: 42, title: 'OpenAI releases a new model' })).toBe(
      'openai-releases-a-new-model',
    )
    expect(baseSlugFor({ id: 42, title: 'Новая модель от OpenAI' })).toBe('openai')
    expect(baseSlugFor({ id: 42, title: 'Новости' })).toBe('yangilik-42')
  })
})
