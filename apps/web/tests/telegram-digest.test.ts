import { createTransliterator } from '@blog-odya/shared'
import { describe, expect, it } from 'vitest'

import { DEFAULT_DIGEST_SETTINGS } from '@/globals/TelegramSettings'
import { CAPTION_LIMIT, transformTemplateText, visibleLength } from '@/telegram/caption'
import { resolveDigestSettings, resolveTelegramConfig } from '@/telegram/config'
import {
  buildDigestCaption,
  digestDateParts,
  digestHashtags,
  type DigestItem,
  digestItemTitle,
  digestPhotos,
  orderDigestItems,
  renderDigestFooter,
  renderDigestHeader,
} from '@/telegram/digestCaption'
import {
  DIGEST_MAX_LATE_MS,
  digestSlotHours,
  dueDigestSlot,
  latestDigestSlot,
  previousDigestSlot,
} from '@/telegram/digestSchedule'

/** DB'siz: Telegram dayjesti (OBLOG-116) — slotlar (Toshkent), tartib, rasmlar, caption ≤ 1024. */

const SCHEDULE = { intervalHours: 3, startHour: 7, endHour: 22 }
/** Toshkent vaqti (UTC+05:00) → epoch ms. */
const tashkent = (local: string) => Date.parse(`${local}+05:00`)
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

function item(id: number, overrides: Partial<DigestItem> = {}): DigestItem {
  return {
    id,
    title: `Sarlavha ${id}`,
    url: `https://blog.odya.uz/texnologiya/post-${id}?utm_source=telegram`,
    photoUrl: `https://media.odya.uz/${id}.webp`,
    priority: 0,
    publishedAt: new Date(Date.UTC(2026, 9, 10, 8, id)).toISOString(),
    tagNames: [],
    ...overrides,
  }
}

describe('dayjest jadvali (Toshkent vaqti)', () => {
  it('standart: 07, 10, 13, 16, 19, 22; boshqa sozlama', () => {
    expect(digestSlotHours(SCHEDULE)).toEqual([7, 10, 13, 16, 19, 22])
    expect(digestSlotHours({ intervalHours: 4, startHour: 8, endHour: 20 })).toEqual([
      8, 12, 16, 20,
    ])
    expect(digestSlotHours({ intervalHours: 3, startHour: 9, endHour: 9 })).toEqual([9])
  })

  it('oxirgi slot ≤ hozir: aniq slot vaqtida — o‘zi, orasida — oldingisi', () => {
    expect(iso(latestDigestSlot(tashkent('2026-10-10T16:00:00'), SCHEDULE))).toBe(
      iso(tashkent('2026-10-10T16:00:00')),
    )
    expect(iso(latestDigestSlot(tashkent('2026-10-10T15:59:59'), SCHEDULE))).toBe(
      iso(tashkent('2026-10-10T13:00:00')),
    )
  })

  it('tun (22:00–07:00) — yuborilmaydi; 07:00 dan oldingi slot — kechagi 22:00', () => {
    expect(dueDigestSlot(tashkent('2026-10-10T03:00:00'), SCHEDULE)).toBeNull()
    expect(dueDigestSlot(tashkent('2026-10-10T00:30:00'), SCHEDULE)).toBeNull()
    expect(iso(dueDigestSlot(tashkent('2026-10-10T22:09:00'), SCHEDULE))).toBe(
      iso(tashkent('2026-10-10T22:00:00')),
    )
    const morning = dueDigestSlot(tashkent('2026-10-10T07:02:00'), SCHEDULE)
    expect(iso(morning)).toBe('2026-10-10T02:00:00.000Z')
    // 07:00 dayjesti tungi postlarni oladi: oyna — kechagi 22:00 dan.
    expect(iso(previousDigestSlot(morning!, SCHEDULE))).toBe(iso(tashkent('2026-10-09T22:00:00')))
    expect(iso(previousDigestSlot(tashkent('2026-10-10T13:00:00'), SCHEDULE))).toBe(
      iso(tashkent('2026-10-10T10:00:00')),
    )
  })

  it('kechikkan tick: 60 daqiqagacha — o‘sha slot, undan ko‘p — yo‘q (keyingi slotga qo‘shiladi)', () => {
    expect(iso(dueDigestSlot(tashkent('2026-10-10T13:10:00'), SCHEDULE))).toBe(
      iso(tashkent('2026-10-10T13:00:00')),
    )
    expect(iso(dueDigestSlot(tashkent('2026-10-10T14:00:00'), SCHEDULE))).toBe(
      iso(tashkent('2026-10-10T13:00:00')),
    )
    expect(dueDigestSlot(tashkent('2026-10-10T14:00:01'), SCHEDULE)).toBeNull()
    expect(dueDigestSlot(tashkent('2026-10-10T15:50:00'), SCHEDULE)).toBeNull()
    expect(DIGEST_MAX_LATE_MS).toBe(60 * 60_000)
  })
})

describe('dayjest: tartib, rasmlar, heshteglar', () => {
  it('muhimlik (kamayish) → chop etilgan vaqt (yangisi oldin)', () => {
    const ordered = orderDigestItems([
      item(1, { publishedAt: '2026-10-10T08:00:00Z' }),
      item(2, { publishedAt: '2026-10-10T09:00:00Z' }),
      item(3, { publishedAt: '2026-10-10T07:00:00Z', priority: 2 }),
      item(4, { publishedAt: '2026-10-10T06:00:00Z', priority: 3 }),
      item(5, { publishedAt: '2026-10-10T09:30:00Z', priority: 2 }),
    ])
    expect(ordered.map((i) => i.id)).toEqual([4, 5, 3, 2, 1])
  })

  it('rasmlar: birinchi 5 band muqovalari, tartib bilan; muqovasiz — o‘tkaziladi', () => {
    const items = [1, 2, 3, 4, 5, 6, 7].map((id) => item(id, id === 2 ? { photoUrl: null } : {}))
    expect(digestPhotos(items, 5)).toEqual([
      'https://media.odya.uz/1.webp',
      'https://media.odya.uz/3.webp',
      'https://media.odya.uz/4.webp',
      'https://media.odya.uz/5.webp',
    ])
    expect(digestPhotos([item(1, { photoUrl: null }), item(2, { photoUrl: null })], 5)).toEqual([])
  })

  it('heshteglar: ko‘p uchragan teg/kategoriya oldin, soni cheklangan', () => {
    const tags = digestHashtags(
      [
        item(1, { tagNames: ['AI', 'Texnologiya'] }),
        item(2, { tagNames: ["Sun'iy intellekt", 'Texnologiya'] }),
        item(3, { tagNames: ['Texnologiya', 'ai'] }),
      ],
      2,
    )
    expect(tags).toEqual(['#Texnologiya', '#AI'])
  })
})

describe('dayjest caption', () => {
  const header = renderDigestHeader(DEFAULT_DIGEST_SETTINGS.header, {
    date: '10-oktabr',
    time: '15:00',
  })
  const footer = renderDigestFooter(DEFAULT_DIGEST_SETTINGS.footer, {
    url: 'https://blog.odya.uz/?utm_source=telegram&utm_medium=channel',
    label: 'blog.odya.uz',
  })

  it('format: sarlavha, raqamlangan havolalar, pastki qator va heshteglar', () => {
    const caption = buildDigestCaption({
      header,
      footer,
      hashtags: ['#Texnologiya', '#AI'],
      items: [item(1), item(2)],
      limit: CAPTION_LIMIT,
      allowDrop: true,
    })
    expect(caption).toEqual({
      count: 2,
      html:
        '📰 Kun yangiliklari — 10-oktabr, 15:00\n\n' +
        '1. <a href="https://blog.odya.uz/texnologiya/post-1?utm_source=telegram">Sarlavha 1</a>\n' +
        '2. <a href="https://blog.odya.uz/texnologiya/post-2?utm_source=telegram">Sarlavha 2</a>\n\n' +
        '🔗 Barchasi: <a href="https://blog.odya.uz/?utm_source=telegram&amp;utm_medium=channel">' +
        'blog.odya.uz</a>\n#Texnologiya #AI',
    })
  })

  it('HTML escape: sarlavha va havola atributi', () => {
    const caption = buildDigestCaption({
      header,
      footer: '',
      hashtags: [],
      items: [
        item(1, { title: 'Apple <iPhone> & "Pro"', url: 'https://x.uz/a?b=1&c="2"' }),
        item(2),
      ],
      limit: CAPTION_LIMIT,
      allowDrop: true,
    })!
    expect(caption.html).toContain(
      '1. <a href="https://x.uz/a?b=1&amp;c=&quot;2&quot;">Apple &lt;iPhone&gt; &amp; "Pro"</a>',
    )
    expect(caption.html).not.toContain('<iPhone>')
  })

  it('10 ta uzun sarlavha — hammasi qoladi, sarlavhalar qisqaradi, ko‘rinadigan uzunlik ≤ 1024', () => {
    const long =
      'Juda uzun sarlavha bo‘yicha kompaniya yangi sun’iy intellekt modelini taqdim etdi va u bir qator ' +
      'sohalarda inson darajasidagi natijalarni ko‘rsatdi, deb xabar bermoqda'
    const items = Array.from({ length: 10 }, (_, i) =>
      item(i + 1, {
        title: `${i + 1} ${long}`,
        url: `https://blog.odya.uz/texnologiya/${'juda-uzun-slug-'.repeat(4)}${i}?utm_source=telegram&utm_medium=channel&utm_campaign=latn`,
      }),
    )
    const caption = buildDigestCaption({
      header,
      footer,
      hashtags: ['#Texnologiya', '#AI'],
      items,
      limit: CAPTION_LIMIT,
      allowDrop: true,
    })!
    expect(caption.count).toBe(10)
    // HTML (havolalar bilan) chegaradan ancha uzun, ko'rinadigan matn — sig'adi.
    expect(caption.html.length).toBeGreaterThan(CAPTION_LIMIT)
    expect(visibleLength(caption.html)).toBeLessThanOrEqual(CAPTION_LIMIT)
    expect(caption.html).toContain('…')
    expect(caption.html).toContain('10. <a href=')
  })

  it('socialTitle — qisqartirishda afzal', () => {
    expect(
      digestItemTitle({ title: 'A'.repeat(100), socialTitle: 'Qisqa sarlavha varianti' }, 70),
    ).toBe('Qisqa sarlavha varianti')
    // To'liq sarlavha sig'sa — o'zi.
    expect(digestItemTitle({ title: 'Oddiy sarlavha', socialTitle: 'Boshqa' }, 70)).toBe(
      'Oddiy sarlavha',
    )
  })

  it('sig‘masa — oxirgi bandlar tushiriladi (yangi dayjest); tahrirlashda — null', () => {
    const bigHeader = `${header}\n${'Diqqat! '.repeat(110)}`
    const items = Array.from({ length: 10 }, (_, i) => item(i + 1))
    const caption = buildDigestCaption({
      header: bigHeader,
      footer,
      hashtags: ['#AI'],
      items,
      limit: CAPTION_LIMIT,
      allowDrop: true,
    })!
    expect(caption.count).toBeLessThan(10)
    expect(caption.count).toBeGreaterThan(0)
    expect(visibleLength(caption.html)).toBeLessThanOrEqual(CAPTION_LIMIT)
    expect(
      buildDigestCaption({
        header: `${header}\n${'Diqqat! '.repeat(140)}`,
        footer,
        hashtags: [],
        items,
        limit: CAPTION_LIMIT,
        allowDrop: false,
      }),
    ).toBeNull()
  })

  it('kirill kanal: sana kirillda, shablon matni transliteratsiya qilinadi', () => {
    const t = createTransliterator()
    const parts = digestDateParts('2026-10-10T10:00:00Z', 'uz-Cyrl')
    expect(parts).toEqual({ date: '10 октябр', time: '15:00' })
    expect(digestDateParts('2026-10-10T10:00:00Z', 'uz-Latn')).toEqual({
      date: '10-oktabr',
      time: '15:00',
    })
    const template = transformTemplateText(DEFAULT_DIGEST_SETTINGS.header, (text) =>
      t.toCyrillic(text),
    )
    expect(renderDigestHeader(template, parts)).toBe('📰 Кун янгиликлари — 10 октябр, 15:00')
    const footerCyrl = transformTemplateText(DEFAULT_DIGEST_SETTINGS.footer, (text) =>
      t.toCyrillic(text),
    )
    expect(renderDigestFooter(footerCyrl, { url: 'https://blog.odya.uz/kr', label: 'x' })).toBe(
      '🔗 Барчаси: <a href="https://blog.odya.uz/kr">x</a>',
    )
  })
})

describe('dayjest sozlamalari', () => {
  it('rejim: standart — digest; noto‘g‘ri qiymat — digest; post/hybrid — o‘zi', () => {
    expect(resolveTelegramConfig(null, {}).mode).toBe('digest')
    expect(resolveTelegramConfig({ mode: 'post' }, {}).mode).toBe('post')
    expect(resolveTelegramConfig({ mode: 'hybrid' }, {}).mode).toBe('hybrid')
    expect(resolveTelegramConfig({ mode: 'other' as unknown as 'post' }, {}).mode).toBe('digest')
  })

  it('chegaralar: maxItems 2–10, maxPhotos 2–10, endHour ≥ startHour, bo‘sh shablon — standart', () => {
    expect(resolveDigestSettings(null)).toEqual({ ...DEFAULT_DIGEST_SETTINGS })
    expect(
      resolveDigestSettings({
        intervalHours: 0,
        startHour: 23,
        endHour: 5,
        maxItems: 50,
        maxPhotos: 1,
        header: '  ',
        footer: 'Sayt: {{site}}',
      }),
    ).toEqual({
      intervalHours: 1,
      startHour: 23,
      endHour: 23,
      maxItems: 10,
      maxPhotos: 2,
      header: DEFAULT_DIGEST_SETTINGS.header,
      footer: 'Sayt: {{site}}',
    })
  })
})
