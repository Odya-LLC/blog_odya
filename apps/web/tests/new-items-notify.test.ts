import { describe, expect, it } from 'vitest'

import {
  formatNewItemsMessage,
  type NewItemsSummary,
  resolveNewItemsSettings,
} from '@/jobs/newItemsNotify'

/** DB'siz: "yangi yangiliklar" xabari matni va sozlamalari (OBLOG-55). */

const ADMIN_URL = 'https://blog.odya.uz/admin/news-queue'

describe('formatNewItemsMessage', () => {
  it('jami, manbalar (ko‘pidan kamiga), rubrikalar va navbat havolasi', () => {
    const summary: NewItemsSummary = {
      total: 14,
      sources: [
        { name: 'iXBT', count: 3 },
        { name: 'Habr', count: 9 },
        { name: 'The Verge', count: 2 },
      ],
      categories: [
        { name: 'Gadjetlar', count: 5 },
        { name: 'Sun’iy intellekt', count: 7 },
      ],
    }
    const text = formatNewItemsMessage(summary, { adminUrl: ADMIN_URL })
    expect(text.split('\n')).toEqual([
      '🆕 <b>Yangi yangiliklar: 14 ta</b>',
      '• Habr — 9',
      '• iXBT — 3',
      '• The Verge — 2',
      'Rubrikalar: Sun’iy intellekt (7), Gadjetlar (5)',
      `<a href="${ADMIN_URL}">Navbatni ochish</a>`,
    ])
  })

  it('HTML ekranlanadi (manba/rubrika nomi, havola)', () => {
    const text = formatNewItemsMessage(
      {
        total: 2,
        sources: [{ name: 'A <b>&</b> B', count: 2 }],
        categories: [{ name: '<i>x</i>', count: 2 }],
      },
      { adminUrl: 'https://x.test/admin/news-queue?a=1&b=2' },
    )
    expect(text).toContain('• A &lt;b&gt;&amp;&lt;/b&gt; B — 2')
    expect(text).toContain('Rubrikalar: &lt;i&gt;x&lt;/i&gt; (2)')
    expect(text).toContain('href="https://x.test/admin/news-queue?a=1&amp;b=2"')
    expect(text).not.toContain('<i>')
  })

  it('manbalar chegarasi: 8 qatordan oshsa — 7 ta + "+N boshqa", jami ≤ 10 qator', () => {
    const sources = Array.from({ length: 12 }, (_, i) => ({ name: `S${i + 1}`, count: 20 - i }))
    const total = sources.reduce((sum, row) => sum + row.count, 0)
    const text = formatNewItemsMessage(
      {
        total,
        sources,
        categories: Array.from({ length: 6 }, (_, i) => ({ name: `C${i}`, count: 6 - i })),
      },
      { adminUrl: ADMIN_URL },
    )
    const lines = text.split('\n')
    expect(lines.length).toBeLessThanOrEqual(11)
    const sourceLines = lines.filter((line) => line.startsWith('• '))
    expect(sourceLines).toHaveLength(8)
    expect(sourceLines[0]).toBe('• S1 — 20')
    // S8..S12: 13 + 12 + 11 + 10 + 9 = 55.
    expect(sourceLines[7]).toBe('• +5 boshqa — 55')
    // Rubrikalar — eng ko'pi 3 ta.
    expect(lines.find((line) => line.startsWith('Rubrikalar:'))).toBe(
      'Rubrikalar: C0 (6), C1 (5), C2 (4)',
    )
  })

  it('aynan 8 manba — "boshqa" qatorisiz; rubrikasiz — "Rubrikalar" qatori yo‘q', () => {
    const sources = Array.from({ length: 8 }, (_, i) => ({ name: `S${i}`, count: 1 }))
    const text = formatNewItemsMessage(
      { total: 8, sources, categories: [] },
      { adminUrl: ADMIN_URL },
    )
    expect(text).not.toContain('boshqa')
    expect(text).not.toContain('Rubrikalar')
    expect(text.split('\n').filter((line) => line.startsWith('• '))).toHaveLength(8)
  })
})

describe('resolveNewItemsSettings', () => {
  it('default: yoqilgan, minimal 1', () => {
    expect(resolveNewItemsSettings(null)).toEqual({ enabled: true, minCount: 1 })
    expect(resolveNewItemsSettings({ notifyNewItems: null, newItemsMinCount: null })).toEqual({
      enabled: true,
      minCount: 1,
    })
  })

  it('o‘chirilgan va chegara', () => {
    expect(resolveNewItemsSettings({ notifyNewItems: false })).toMatchObject({ enabled: false })
    expect(resolveNewItemsSettings({ newItemsMinCount: 5 })).toEqual({
      enabled: true,
      minCount: 5,
    })
    // 0 / manfiy — 1 ga tenglashtiriladi.
    expect(resolveNewItemsSettings({ newItemsMinCount: 0 }).minCount).toBe(1)
    expect(resolveNewItemsSettings({ newItemsMinCount: 2.6 }).minCount).toBe(3)
  })
})
