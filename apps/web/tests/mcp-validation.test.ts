import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { lockedFields, planCyrillic } from '@/mcp/cyrillic'
import { markdownToLexical } from '@/mcp/markdown'
import { createDraftInput, saveRewriteInput, setSeoInput } from '@/mcp/schemas'
import {
  charLength,
  checkRewriteFields,
  checkSeoFields,
  containsKeyword,
  findCyrillic,
  hasWrongOkina,
  ngramSimilarity,
  type PostSeoState,
  seoScore,
  seoWarnings,
  similarityWarning,
  sourcesError,
} from '@/mcp/validation'
import { assertEditable } from '@/mcp/write-tools'
import type { Post } from '@/payload-types'

/** MCP yozish toollari (M2-07): DB'siz tekshiruvlar — §5.3 qoidalari, SEO ball, kirill rejasi. */

const words = (count: number, word = 'soʻz') => Array.from({ length: count }, () => word).join(' ')

function stats(markdown: string) {
  return markdownToLexical(markdown, { siteHost: 'blog.odya.uz' }).stats
}

const GOOD_BODY = [
  `iPhone 18 taqdimoti oktabrga koʻchirildi. ${words(150)}`,
  '',
  '## iPhone 18 taqdimoti sanasi',
  '',
  `${words(150)} [Apple oʻtgan yilgi taqdimoti](/gadjetlar/apple-2025) va [narxlar](/gadjetlar/narx).`,
  '',
  '## Oʻzbekiston uchun ahamiyati',
  '',
  `${words(150)} Manba: [Bloomberg](https://www.bloomberg.com/x).`,
].join('\n')

function goodState(overrides: Partial<PostSeoState> = {}): PostSeoState {
  return {
    title: 'Apple iPhone 18 taqdimotini oktabrga koʻchirdi',
    excerpt:
      'Apple iPhone 18 taqdimotini 2026-yil oktabr oyiga koʻchirdi. Bloomberg maʼlumotiga koʻra, ' +
      'kechikishga yangi protsessor ishlab chiqarishdagi muammolar sabab boʻlgan.',
    body: stats(GOOD_BODY),
    hasCategory: true,
    tagsCount: 4,
    seoTitle: 'iPhone 18 taqdimoti oktabrga koʻchirildi',
    metaDescription:
      'iPhone 18 taqdimoti oktabrga koʻchirildi: Bloomberg maʼlumotiga koʻra, sabab — yangi ' +
      'protsessor ishlab chiqarishdagi muammolar. Sanalar va tafsilotlar.',
    focusKeyword: 'iPhone 18 taqdimoti',
    faqCount: 2,
    coverAlt: 'Apple logotipi tushirilgan sahna va taqdimot zali',
    sourcesCount: 1,
    ...overrides,
  }
}

describe('lotin maydonlari va uzunliklar (TZ §5.3)', () => {
  it('kirill harflari — tushunarli xato, maydon nomi bilan', () => {
    const result = checkRewriteFields({
      title: 'Apple янги iPhone',
      excerpt: 'Lid',
      body: stats('Matn **қалин**'),
      tags: ['Apple', 'Смартфон'],
    })
    expect(result.errors.map((issue) => [issue.field, issue.code])).toEqual([
      ['title', 'cyrillic_in_latin'],
      ['body', 'cyrillic_in_latin'],
      ['tags[1]', 'cyrillic_in_latin'],
    ])
    expect(result.errors[0]?.message).toBe(
      "Sarlavha lotin yozuvida bo'lishi kerak — kirill harflari topildi: я, н, г, и. " +
        'Kirill versiyasi avtomatik yaratiladi.',
    )
    expect(findCyrillic('abc')).toEqual([])
  })

  it('uzunlik chegaralari: title ≤ 70, excerpt ≤ 300, bo‘sh maydonlar', () => {
    const result = checkRewriteFields({
      title: 'A'.repeat(71),
      excerpt: 'B'.repeat(301),
      body: stats(''),
      tags: Array.from({ length: 8 }, (_, i) => `teg${i}`),
    })
    expect(result.errors.map((issue) => `${issue.field}:${issue.code}`)).toEqual([
      'title:too_long',
      'excerpt:too_long',
      'body:required',
      'tags:too_many',
    ])
    expect(result.errors[0]?.message).toBe('Sarlavha 70 belgidan oshmasligi kerak (hozir 71).')
    // `ʻ` — bitta belgi.
    expect(charLength('oʻgʻil')).toBe(6)
  })

  it('clickbait, nuqta va noto‘g‘ri apostrof — ogohlantirish', () => {
    const result = checkRewriteFields({
      title: "Bu SHOK! Hammasi o'zgardi.",
      excerpt: "Toshkentda yangi bog'cha ochildi",
      body: stats('Matn'),
      tags: [],
    })
    expect(result.errors).toEqual([])
    expect(result.warnings.map((issue) => `${issue.field}:${issue.code}`)).toEqual([
      'title:wrong_apostrophe',
      'title:clickbait',
      'title:trailing_period',
      'excerpt:wrong_apostrophe',
    ])
    expect(hasWrongOkina('Oʻzbekiston')).toBe(false)
    expect(hasWrongOkina("Google's")).toBe(false)
    expect(hasWrongOkina('ko‘p')).toBe(true)
  })

  it('set_seo: seoTitle ≤ 60, metaDescription 140–160, focusKeyword 1–4 so‘z, FAQ', () => {
    const result = checkSeoFields({
      seoTitle: 'S'.repeat(61),
      metaDescription: 'qisqa',
      focusKeyword: 'bir ikki uch tort besh',
      faq: [
        { question: 'Savol', answer: 'Javob' },
        { question: 'Ikkinchi?', answer: '' },
        { question: 'Q3?', answer: 'A' },
        { question: 'Q4?', answer: 'A' },
        { question: 'Q5?', answer: 'A' },
      ],
      coverAlt: 'Rasm',
    })
    expect(result.errors.map((issue) => `${issue.field}:${issue.code}`)).toEqual([
      'seoTitle:too_long',
      'metaDescription:too_short',
      'focusKeyword:too_long',
      'faq:too_many',
      'faq[1]:required',
    ])
    expect(result.errors[1]?.message).toBe(
      "metaDescription 140–160 belgi bo'lishi kerak (hozir 5).",
    )
    expect(result.warnings.map((issue) => `${issue.field}:${issue.code}`)).toEqual([
      'faq[0].question:no_question_mark',
      'coverAlt:length',
      'coverAlt:starts_with_image',
    ])
  })

  it('set_seo: to‘g‘ri qiymatlar — xatosiz; kirill — xato', () => {
    const state = goodState()
    const ok = checkSeoFields({
      seoTitle: state.seoTitle,
      metaDescription: state.metaDescription,
      focusKeyword: state.focusKeyword,
      faq: [
        { question: 'iPhone 18 qachon taqdim etiladi?', answer: 'Oktabrda.' },
        { question: 'Nima uchun kechiktirildi?', answer: 'Protsessor sababli.' },
      ],
      coverAlt: state.coverAlt,
    })
    expect(ok).toEqual({ errors: [], warnings: [] })
    const cyr = checkSeoFields({
      ...ok,
      seoTitle: 'Айфон',
      metaDescription: state.metaDescription,
      focusKeyword: 'x',
    })
    expect(cyr.errors.map((issue) => issue.code)).toEqual(['cyrillic_in_latin'])
  })

  it('sources bo‘sh — xato', () => {
    expect(sourcesError(0)?.code).toBe('sources_empty')
    expect(sourcesError(2)).toBeNull()
  })
})

describe('SEO ball va tavsiyalar', () => {
  it('to‘liq to‘ldirilgan post — 100 ball, ogohlantirishsiz', () => {
    expect(seoWarnings(goodState(), 'all')).toEqual([])
    expect(seoScore(goodState())).toBe(100)
  })

  it('kalit so‘z o‘zbek qo‘shimchalari bilan topiladi', () => {
    expect(containsKeyword('iPhone 18 taqdimotini koʻchirdi', 'iPhone 18 taqdimoti')).toBe(true)
    expect(containsKeyword("ChatGPT o'zbek tilida", 'ChatGPT oʻzbek tilida')).toBe(true)
    expect(containsKeyword('Samsung yangiligi', 'iPhone 18 narxi')).toBe(false)
  })

  it('kamchiliklar ball va ogohlantirishlarda ko‘rinadi', () => {
    const state = goodState({
      body: stats('Qisqa matn.'),
      tagsCount: 1,
      focusKeyword: 'Samsung Galaxy',
      coverAlt: '',
    })
    const codes = seoWarnings(state, 'all').map((issue) => `${issue.field}:${issue.code}`)
    expect(codes).toEqual([
      'body:seo_word_count',
      'body:seo_headings',
      'body:seo_internal_links',
      'body:seo_external_links',
      'tags:seo_count',
      'title:seo_keyword_missing',
      'seoTitle:seo_keyword_missing',
      'excerpt:seo_keyword_missing',
      'metaDescription:seo_keyword_missing',
      'body:seo_keyword_missing',
      'coverAlt:seo_missing',
    ])
    expect(seoScore(state)).toBe(35)
  })

  it('save_rewrite bosqichida SEO maydonlari haqida ogohlantirilmaydi', () => {
    const state = goodState({ seoTitle: '', metaDescription: '', focusKeyword: '', coverAlt: '' })
    expect(seoWarnings(state, 'rewrite')).toEqual([])
    expect(seoWarnings(state, 'all').map((issue) => issue.field)).toEqual([
      'seoTitle',
      'metaDescription',
      'coverAlt',
    ])
  })
})

describe('manba bilan n-gram o‘xshashlik', () => {
  const source =
    'Apple has delayed the iPhone 18 launch event to October according to people familiar with ' +
    'the matter, citing production issues with the new A20 processor made by TSMC in Taiwan.'

  it('mustaqil qayta yozilgan matn — ogohlantirishsiz', () => {
    const rewritten =
      'Apple iPhone 18 taqdimotini oktabrga koʻchirdi. Bloomberg maʼlumotiga koʻra, sabab — ' +
      'TSMC ishlab chiqaradigan yangi A20 protsessoridagi muammolar.'
    const similarity = ngramSimilarity(rewritten, source)
    expect(similarity.containment).toBe(0)
    expect(similarityWarning(similarity)).toBeNull()
  })

  it('ko‘chirilgan matn — ogohlantirish (foiz va bo‘lak uzunligi bilan)', () => {
    const similarity = ngramSimilarity(`Kirish. ${source}`, source)
    expect(similarity.containment).toBeGreaterThan(0.9)
    expect(similarity.longestRun).toBe(30)
    const warning = similarityWarning(similarity)
    expect(warning?.code).toBe('source_similarity')
    expect(warning?.message).toMatch(/eng uzun ko'chirilgan bo'lak 30 so'z/)
  })

  it('qisman ko‘chirish (uzun bo‘lak) ham ushlanadi', () => {
    const copied = source.split(' ').slice(0, 17).join(' ')
    const text = `${words(200)} ${copied} ${words(200, 'boshqa')}`
    const similarity = ngramSimilarity(text, source)
    expect(similarity.containment).toBeLessThan(0.25)
    expect(similarity.longestRun).toBe(17)
    expect(similarityWarning(similarity)).not.toBeNull()
  })

  it('bo‘sh manba yoki qisqa matn — 0', () => {
    expect(ngramSimilarity('bir ikki', source)).toEqual({ containment: 0, longestRun: 0 })
    expect(ngramSimilarity(source, '')).toEqual({ containment: 0, longestRun: 0 })
  })
})

describe('kirill rejasi (uz-Cyrl)', () => {
  it('lotindan kirill: matn, Lexical, meta, FAQ; kod va URL o‘zgarmaydi', () => {
    const content = markdownToLexical(
      'Oʻzbekiston [sayti](https://gov.uz) va `npm install` buyrugʻi.\n\n```sh\necho salom\n```',
    ).state
    const { data, skipped } = planCyrillic(
      {
        title: 'Yangi smartfon',
        excerpt: 'Qisqacha maʼlumot',
        content,
        meta: { title: 'Sarlavha', description: 'Tavsif', focusKeyword: 'smartfon narxi' },
        faq: [{ question: 'Qachon?', answer: 'Ertaga.' }],
        coverAlt: 'Qora telefon',
      },
      new Set(),
    )
    expect(skipped).toEqual([])
    expect(data.title).toBe('Янги смартфон')
    expect(data.excerpt).toBe('Қисқача маълумот')
    expect(data.meta).toEqual({
      title: 'Сарлавҳа',
      description: 'Тавсиф',
      focusKeyword: 'смартфон нархи',
    })
    expect(data.faq).toEqual([{ question: 'Қачон?', answer: 'Эртага.' }])
    expect(data.coverAlt).toBe('Қора телефон')
    const json = JSON.stringify(data.content)
    expect(json).toContain('Ўзбекистон')
    expect(json).toContain('https://gov.uz')
    expect(json).toContain('npm install')
    expect(json).toContain('echo salom')
  })

  it('qulflangan maydonlar (cyrlLocked) — o‘tkazib yuboriladi', () => {
    const locked = lockedFields({ cyrlLocked: { title: true, meta: true, excerpt: false } })
    expect([...locked].sort()).toEqual(['meta', 'title'])
    const { data, skipped } = planCyrillic(
      { title: 'Sarlavha', excerpt: 'Lid', meta: { title: 'SEO' } },
      locked,
    )
    expect(Object.keys(data)).toEqual(['excerpt'])
    expect(skipped).toEqual(['title', 'meta'])
    expect(lockedFields({ cyrlLocked: null }).size).toBe(0)
  })
})

describe('egalik va holat (assertEditable)', () => {
  const post = (extra: Partial<Post>) => ({ id: 7, workflowStatus: 'draft', ...extra }) as Post

  it('faqat draft/in_progress va o‘ziga biriktirilgan', () => {
    expect(() => assertEditable(post({ assignee: 5 }), 5)).not.toThrow()
    expect(() =>
      assertEditable(post({ workflowStatus: 'in_progress', assignee: 5 }), 5),
    ).not.toThrow()
    expect(() => assertEditable(post({ workflowStatus: 'published', assignee: 5 }), 5)).toThrow(
      /"published" holatida — MCP orqali faqat draft yoki in_progress.*muharrir admin panelda/,
    )
    expect(() => assertEditable(post({ workflowStatus: 'review', assignee: 5 }), 5)).toThrow(
      /tekshiruvda/,
    )
    expect(() => assertEditable(post({ assignee: null }), 5)).toThrow(/avval claim_draft/)
    expect(() => assertEditable(post({ assignee: 6 }), 5)).toThrow(/boshqa foydalanuvchiga/)
  })
})

describe('kirish sxemalari (Zod)', () => {
  it('create_draft: 1–10 ta ID', () => {
    const schema = z.object(createDraftInput)
    expect(schema.parse({ scrapedItemIds: [1, 2] })).toEqual({ scrapedItemIds: [1, 2] })
    expect(() => schema.parse({ scrapedItemIds: [] })).toThrow(/kamida bitta ID/)
    expect(() =>
      schema.parse({ scrapedItemIds: Array.from({ length: 11 }, (_, i) => i + 1) }),
    ).toThrow(/ko'pi bilan 10/)
  })

  it('save_rewrite: teglar — nom yoki ID; majburiy maydonlar', () => {
    const schema = z.object(saveRewriteInput)
    const parsed = schema.parse({
      postId: 1,
      title: 'T',
      excerpt: 'E',
      body: 'B',
      category: 'gadjetlar',
      tags: ['Apple', 5, '  iPhone  '],
    })
    expect(parsed.tags).toEqual(['Apple', 5, 'iPhone'])
    expect(() => schema.parse({ postId: 1, excerpt: 'E', body: 'B', category: 1 })).toThrow(
      /title: majburiy maydon/,
    )
    expect(() =>
      schema.parse({ postId: 1, title: 'T', excerpt: 'E', body: 'B', category: 1, tags: [''] }),
    ).toThrow()
  })

  it('set_seo: faq ixtiyoriy', () => {
    const schema = z.object(setSeoInput)
    expect(
      schema.parse({ postId: 1, seoTitle: 'S', metaDescription: 'M', focusKeyword: 'K' }).faq,
    ).toBeUndefined()
  })
})
