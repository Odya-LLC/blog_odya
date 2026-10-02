import { describe, expect, it } from 'vitest'

import {
  formatWordDelta,
  type RevisionSide,
  summarizeRevision,
  wordCount,
} from '@/editorial/revisionDiff'

function lexical(...paragraphs: string[]) {
  return {
    root: {
      type: 'root',
      children: paragraphs.map((text) => ({
        type: 'paragraph',
        children: [{ type: 'text', text }],
      })),
    },
  }
}

const base: RevisionSide = {
  title: 'Apple taqdimoti oktabrga koʻchirildi',
  excerpt: 'Lid matni',
  meta: { title: 'SEO', description: 'Tavsif', focusKeyword: 'apple' },
  content: lexical('Birinchi gap.', 'Ikkinchi gap bu yerda.') as unknown as RevisionSide['content'],
  coverImage: 5,
  coverAlt: 'Alt',
  faq: [{ question: 'Qachon?', answer: 'Oktabrda.' }],
  tags: [1, 2],
  category: 3,
  sources: [{ url: 'https://example.com/a', name: 'Example' }],
}

describe('summarizeRevision (OBLOG-64)', () => {
  it('o‘zgarish bo‘lmasa — bo‘sh', () => {
    expect(summarizeRevision(base, { ...base })).toEqual([])
    // Populyatsiya qilingan bog'lanishlar va teglar tartibi farq hisoblanmaydi; bo'shliqlar ham.
    expect(
      summarizeRevision(base, {
        ...base,
        title: `  ${base.title} `,
        coverImage: { id: 5 } as unknown as RevisionSide['coverImage'],
        tags: [2, 1],
        category: { id: 3 } as unknown as RevisionSide['category'],
      }),
    ).toEqual([])
  })

  it('matnli maydonlar — from/to; matn — so‘zlar farqi; qolganlari — belgi', () => {
    const changes = summarizeRevision(base, {
      ...base,
      title: 'Yangi sarlavha',
      meta: { ...base.meta, description: 'Yangi tavsif' },
      content: lexical(
        'Birinchi gap.',
        'Ikkinchi gap bu yerda.',
        'Uchinchi yangi gap.',
      ) as unknown as RevisionSide['content'],
      coverImage: 6,
      faq: [],
      tags: [1],
      sources: [],
    })
    expect(changes.map((change) => change.field)).toEqual([
      'title',
      'metaDescription',
      'content',
      'coverImage',
      'faq',
      'tags',
      'sources',
    ])
    expect(changes[0]).toEqual({
      field: 'title',
      label: 'Sarlavha',
      from: base.title,
      to: 'Yangi sarlavha',
    })
    expect(changes[2]).toMatchObject({ words: { from: 6, to: 9, delta: 3 } })
  })

  it('null/undefined qiymatlar bo‘sh satr kabi', () => {
    expect(summarizeRevision({ ...base, excerpt: null }, { ...base, excerpt: undefined })).toEqual(
      [],
    )
    expect(summarizeRevision({ ...base, excerpt: null }, base)).toEqual([
      { field: 'excerpt', label: 'Lid', from: '', to: 'Lid matni' },
    ])
  })

  it('wordCount va formatWordDelta', () => {
    expect(wordCount(base.content)).toBe(6)
    expect(wordCount(null)).toBe(0)
    expect(formatWordDelta(12)).toBe('+12 soʻz')
    expect(formatWordDelta(-5)).toBe('−5 soʻz')
    expect(formatWordDelta(0)).toBe('soʻzlar soni oʻzgarmagan')
  })
})
