import { describe, expect, it } from 'vitest'

import {
  canTransition,
  checkTransition,
  POST_WORKFLOW_STATUSES,
  WORKFLOW_STATES,
  type WorkflowState,
} from '@/collections/Posts/workflow'
import { countWords, readingTimeMinutes } from '@/lib/lexical'
import { toSlug, validateSlug } from '@/lib/slug'

/**
 * TZ §4.1 diagrammasi (mermaid `stateDiagram-v2`) — qo'lda ko'chirilgan qirralar ro'yxati.
 * Kod (`WORKFLOW_TRANSITIONS`) shu ro'yxatga to'liq mos bo'lishi kerak: ortiqcha o'tish ham,
 * yetishmayotgani ham test'ni yiqitadi.
 */
const DIAGRAM_EDGES: ReadonlyArray<readonly [WorkflowState, WorkflowState]> = [
  ['scraped', 'draft'],
  ['scraped', 'rejected'],
  ['draft', 'in_progress'],
  ['in_progress', 'review'],
  ['review', 'in_progress'],
  ['review', 'scheduled'],
  ['review', 'published'],
  ['scheduled', 'published'],
  ['published', 'archived'],
  ['draft', 'rejected'],
  ['review', 'rejected'],
]

const isEdge = (from: WorkflowState, to: WorkflowState) =>
  DIAGRAM_EDGES.some(([a, b]) => a === from && b === to)

describe('workflow: TZ §4.1 o‘tishlar matritsasi', () => {
  const pairs = WORKFLOW_STATES.flatMap((from) =>
    WORKFLOW_STATES.filter((to) => to !== from).map((to) => [from, to] as const),
  )

  it.each(pairs)('%s → %s diagrammaga mos', (from, to) => {
    expect(canTransition(from, to)).toBe(isEdge(from, to))
    const result = checkTransition(from, to)
    expect(result.ok).toBe(isEdge(from, to))
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('bir xil holat — o‘tish emas, har doim ruxsat', () => {
    for (const state of WORKFLOW_STATES) expect(checkTransition(state, state).ok).toBe(true)
  })

  it('acceptance misollari: draft → published va scraped → review rad etiladi', () => {
    expect(checkTransition('draft', 'published')).toMatchObject({ ok: false, status: 400 })
    expect(checkTransition('scraped', 'review')).toMatchObject({ ok: false, status: 400 })
    expect(checkTransition('in_progress', 'published')).toMatchObject({ ok: false, status: 400 })
    expect(checkTransition('rejected', 'draft')).toMatchObject({ ok: false, status: 400 })
    expect(checkTransition('archived', 'published')).toMatchObject({ ok: false, status: 400 })
  })

  it('arxivlash — faqat admin (TZ §4.2); tizim (foydalanuvchisiz) — diagramma bo‘yicha', () => {
    expect(checkTransition('published', 'archived', 'editor')).toMatchObject({
      ok: false,
      status: 403,
    })
    expect(checkTransition('published', 'archived', 'admin').ok).toBe(true)
    expect(checkTransition('published', 'archived').ok).toBe(true)
  })

  it('editor ham publish/schedule/reject qila oladi (TZ §4.2 qarori)', () => {
    expect(checkTransition('review', 'published', 'editor').ok).toBe(true)
    expect(checkTransition('review', 'scheduled', 'editor').ok).toBe(true)
    expect(checkTransition('review', 'rejected', 'editor').ok).toBe(true)
    expect(checkTransition('scheduled', 'published', 'editor').ok).toBe(true)
  })

  it('postlar holatlari: scraped yo‘q (u scraped-items holati)', () => {
    expect(POST_WORKFLOW_STATUSES).not.toContain('scraped')
    expect(POST_WORKFLOW_STATUSES).toEqual([
      'draft',
      'in_progress',
      'review',
      'scheduled',
      'published',
      'rejected',
      'archived',
    ])
  })
})

const lexical = (...paragraphs: string[]) => ({
  root: {
    type: 'root',
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      children: [{ type: 'text', text }],
    })),
  },
})

describe('readingTime', () => {
  it('so‘zlarni o‘zbekcha apostroflar bilan to‘g‘ri sanaydi', () => {
    expect(countWords('Oʻzbekiston sunʼiy intellekt g‘oyasi')).toBe(4)
    expect(countWords('')).toBe(0)
  })

  it('200 so‘z/daqiqa, yuqoriga yaxlitlanadi, kamida 1; bo‘sh matn — 0', () => {
    expect(readingTimeMinutes(null)).toBe(0)
    expect(readingTimeMinutes(lexical('bir ikki uch'))).toBe(1)
    expect(readingTimeMinutes(lexical(Array(200).fill('soʻz').join(' ')))).toBe(1)
    expect(readingTimeMinutes(lexical(Array(201).fill('soʻz').join(' ')))).toBe(2)
    expect(
      readingTimeMinutes(lexical(Array(300).fill('a').join(' '), Array(300).fill('b').join(' '))),
    ).toBe(3)
  })
})

describe('slug (vaqtinchalik, M1-03 gacha)', () => {
  it('lotin sarlavhadan slug yasaydi', () => {
    expect(toSlug('Sunʼiy intellekt: OʻzGPT taqdim etildi!')).toBe(
      'suniy-intellekt-ozgpt-taqdim-etildi',
    )
    expect(toSlug("  O'yinlar  ")).toBe('oyinlar')
  })

  it('validatsiya: format va band qilingan slug’lar', () => {
    expect(validateSlug('suniy-intellekt')).toBe(true)
    expect(validateSlug('Katta-Harf')).not.toBe(true)
    expect(validateSlug('kr')).not.toBe(true)
    expect(validateSlug('a--b')).not.toBe(true)
  })
})
