import { describe, expect, it } from 'vitest'

import glossaryJson from '../glossary.seed.json' with { type: 'json' }
import translitJson from '../translit-exceptions.seed.json' with { type: 'json' }
import {
  fillPlaceholders,
  findDuplicateKeys,
  glossaryKey,
  glossarySeed,
  glossarySeedSchema,
  GUIDELINE_DOCS,
  LEGAL_PAGES,
  LEGAL_PLACEHOLDERS,
  loadAllGuidelines,
  loadLegalPages,
  parseFrontMatter,
  translitExceptionsSeed,
  translitExceptionsSeedSchema,
  translitKey,
} from './index'

const CYRILLIC_RE = /[\u0400-\u04FF]/

/** Kod bloklari va inline kodni olib tashlaydi (ularda ataylab "noto'g'ri" misollar bor). */
const stripCode = (md: string) => md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')

describe('glossary.seed.json', () => {
  it('Zod sxemasidan oʻtadi', () => {
    const result = glossarySeedSchema.safeParse(glossaryJson)
    expect(result.success, JSON.stringify(result.error?.issues.slice(0, 5))).toBe(true)
  })

  it('kamida 150 ta atama, versiya va sana bor', () => {
    expect(glossarySeed.items.length).toBeGreaterThanOrEqual(150)
    expect(glossarySeed.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(glossarySeed.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('dublikatlar yoʻq (atama boʻyicha, katta-kichik harf farqlanmaydi)', () => {
    expect(findDuplicateKeys(glossarySeed.items, glossaryKey)).toEqual([])
  })

  it('brendlar roʻyxati bor va ular tarjima/transliteratsiya qilinmaydi', () => {
    const brands = glossarySeed.items.filter((item) => item.kind === 'brand')
    expect(brands.length).toBeGreaterThanOrEqual(50)
    for (const brand of brands) {
      expect(brand.doNotTranslate && brand.doNotTransliterate, brand.term).toBe(true)
    }
    const terms = new Set(brands.map((b) => b.term))
    for (const name of ['OpenAI', 'ChatGPT', 'iPhone', 'Counter-Strike 2', 'Dota 2', 'Telegram']) {
      expect(terms.has(name), name).toBe(true)
    }
  })

  it('EN va RU atamalar bor', () => {
    const langs = new Set(glossarySeed.items.map((item) => item.language))
    expect(langs).toEqual(new Set(['en', 'ru']))
  })

  it('dublikatni sxema rad etadi', () => {
    const first = glossarySeed.items[0]!
    const bad = {
      ...glossaryJson,
      items: [...glossarySeed.items, { ...first, term: first.term.toUpperCase() }],
    }
    expect(glossarySeedSchema.safeParse(bad).success).toBe(false)
  })

  it('tarjimada kirill yoki ASCII apostrof boʻlsa, sxema rad etadi', () => {
    const base = { ...glossaryJson, items: [] as unknown[] }
    const item = {
      term: 'update',
      language: 'en',
      kind: 'term',
      doNotTranslate: false,
      doNotTransliterate: false,
    }
    for (const translation of ["o'zgarish", 'янгиланиш', 'ma’lumot']) {
      const parsed = glossarySeedSchema.safeParse({ ...base, items: [{ ...item, translation }] })
      expect(parsed.success, translation).toBe(false)
    }
  })
})

describe('translit-exceptions.seed.json', () => {
  it('Zod sxemasidan oʻtadi', () => {
    const result = translitExceptionsSeedSchema.safeParse(translitJson)
    expect(result.success, JSON.stringify(result.error?.issues.slice(0, 5))).toBe(true)
  })

  it('kamida 300 ta yozuv, versiya va sana bor', () => {
    expect(translitExceptionsSeed.items.length).toBeGreaterThanOrEqual(300)
    expect(translitExceptionsSeed.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(translitExceptionsSeed.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('dublikatlar yoʻq (lotin shakli boʻyicha, katta-kichik harf farqlanmaydi)', () => {
    expect(findDuplicateKeys(translitExceptionsSeed.items, translitKey)).toEqual([])
  })

  it('TZ §3.6 dagi majburiy misollar bor', () => {
    const map = new Map(translitExceptionsSeed.items.map((i) => [i.latin.toLowerCase(), i]))
    expect(map.get('sentabr')?.cyrillic).toBe('сентябрь')
    expect(map.get('sirk')?.cyrillic).toBe('цирк')
    expect(map.get('konsert')?.cyrillic).toBe('концерт')
    for (const month of [
      'yanvar',
      'fevral',
      'aprel',
      'iyun',
      'iyul',
      'oktabr',
      'noyabr',
      'dekabr',
    ]) {
      expect(map.get(month)?.cyrillic, month).toMatch(/ь$/)
    }
  })

  it('dublikatni sxema rad etadi', () => {
    const first = translitExceptionsSeed.items[0]!
    const bad = {
      ...translitJson,
      items: [...translitExceptionsSeed.items, { ...first, latin: first.latin.toUpperCase() }],
    }
    expect(translitExceptionsSeedSchema.safeParse(bad).success).toBe(false)
  })

  it('lotin maydonida kirill, kirill maydonida lotin boʻlsa, sxema rad etadi', () => {
    for (const item of [
      { latin: 'сирк', cyrillic: 'цирк', matchType: 'whole_word' },
      { latin: 'sirk', cyrillic: 'cirk', matchType: 'whole_word' },
      { latin: 'sirk', cyrillic: 'цирк', matchType: 'suffix' },
    ]) {
      const parsed = translitExceptionsSeedSchema.safeParse({ ...translitJson, items: [item] })
      expect(parsed.success, JSON.stringify(item)).toBe(false)
    }
  })
})

describe('Markdown hujjatlar', () => {
  const guidelines = loadAllGuidelines()
  const legal = loadLegalPages()
  const all = [...guidelines, ...legal]

  it('barcha fayllar mavjud, front-matterda versiya va sana bor', () => {
    expect(guidelines).toHaveLength(GUIDELINE_DOCS.length)
    expect(legal).toHaveLength(6)
    for (const doc of all) {
      expect(doc.frontMatter.version, doc.file).toMatch(/^\d+\.\d+\.\d+$/)
      expect(doc.frontMatter.updatedAt, doc.file).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(doc.markdown.length, doc.file).toBeGreaterThan(500)
    }
  })

  it('har bir hujjat bitta H1 sarlavha bilan boshlanadi', () => {
    for (const doc of all) {
      expect(doc.markdown.startsWith('# '), doc.file).toBe(true)
      expect(stripCode(doc.markdown).match(/^# /gm), doc.file).toHaveLength(1)
    }
  })

  it('kod bloklari yopilgan', () => {
    for (const doc of all) {
      expect((doc.markdown.match(/^```/gm) ?? []).length % 2, doc.file).toBe(0)
    }
  })

  it('oʻ/gʻ va tutuq belgisi uchun notoʻgʻri apostrof ishlatilmagan (koddan tashqari)', () => {
    for (const doc of all) {
      const text = stripCode(doc.markdown)
      expect(text.match(/[A-Za-z]['‘’][A-Za-z]/g), doc.file).toBeNull()
    }
  })

  it('huquqiy sahifalarda kirill harflari yoʻq', () => {
    for (const doc of legal) {
      expect(CYRILLIC_RE.test(doc.markdown), doc.file).toBe(false)
    }
  })

  it('huquqiy sahifalar slugi reestr bilan mos, faqat maʼlum oʻrinbosarlar ishlatilgan', () => {
    const known = new Set<string>(LEGAL_PLACEHOLDERS)
    for (const doc of legal) {
      expect(doc.frontMatter.slug, doc.file).toBe(doc.slug)
      for (const [, key] of doc.markdown.matchAll(/\{\{([A-Z_]+)\}\}/g)) {
        expect(known.has(key!), `${doc.file}: ${key}`).toBe(true)
      }
    }
    expect(new Set(LEGAL_PAGES.map((p) => p.slug)).size).toBe(LEGAL_PAGES.length)
  })

  it('48 soatlik shikoyat muddati koʻrsatilgan', () => {
    const complaints = legal.find((doc) => doc.id === 'legal-copyright-complaints')!
    expect(complaints.markdown).toContain('48 soat')
  })

  it('SEO chegaralari TZ §5.2 bilan mos', () => {
    const seo = guidelines.find((doc) => doc.id === 'seo')!.markdown
    for (const rule of ['≤ 70', '≤ 60', '140–160', '400–900', '2–5', '3–7', '2–4']) {
      expect(seo, rule).toContain(rule)
    }
  })
})

describe('yordamchi funksiyalar', () => {
  it('parseFrontMatter', () => {
    const { data, body } = parseFrontMatter('---\nid: x\nversion: 1.0.0\n---\n\n# Sarlavha\n')
    expect(data).toEqual({ id: 'x', version: '1.0.0' })
    expect(body).toBe('# Sarlavha\n')
    expect(() => parseFrontMatter('# Front-matter yo‘q')).toThrow()
  })

  it('fillPlaceholders', () => {
    expect(
      fillPlaceholders('Pochta: {{CONTACT_EMAIL}}, {{PRIVACY_EMAIL}}', {
        CONTACT_EMAIL: 'info@example.com',
      }),
    ).toBe('Pochta: info@example.com, {{PRIVACY_EMAIL}}')
  })
})
