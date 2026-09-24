import { describe, expect, it } from 'vitest'

import type { Page } from '@/payload-types'
import { TAG_INDEX_MIN_POSTS } from '@/site/seo/config'
import { tagRobots } from '@/site/seo/metadata'
import { authorSeo, pageFaqItems, searchMetadata, staticPageSeo, tagSeo } from '@/site/seo/pages'

const ORIGIN = 'https://blog.odya.uz'
const opts = { origin: ORIGIN, indexingAllowed: true }

const tag = {
  slug: 'cs2',
  name: 'CS2',
  description: null,
  metaTitle: null,
  metaDescription: null,
  noindex: false,
}

/** M1-07 sahifalari SEO'si: teg (`noindex` < 3 post), muallif (`Person`), statik sahifa, qidiruv. */
describe('teg sahifasi SEO', () => {
  it(`< ${TAG_INDEX_MIN_POSTS} post — noindex, follow; aks holda indekslanadi`, () => {
    const few = tagSeo('uz-Latn', tag, 1, TAG_INDEX_MIN_POSTS - 1, opts).metadata
    expect(few.robots).toEqual({ index: false, follow: true })
    expect(few.robots).toEqual(tagRobots(TAG_INDEX_MIN_POSTS - 1, false, true))
    const many = tagSeo('uz-Latn', tag, 1, TAG_INDEX_MIN_POSTS, opts).metadata
    expect(many.robots).toBeUndefined()
    const metaNoindex = tagSeo('uz-Latn', { ...tag, noindex: true }, 1, 50, opts).metadata
    expect(metaNoindex.robots).toEqual({ index: false, follow: true })
  })

  it('canonical — o‘ziga (sahifalash bilan), hreflang juftligi', () => {
    const { metadata, jsonLd } = tagSeo('uz-Cyrl', { ...tag, name: 'CS2' }, 2, 30, opts)
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/kr/tag/cs2/page/2`)
    expect(metadata.alternates?.languages).toMatchObject({
      'uz-Latn': `${ORIGIN}/tag/cs2/page/2`,
      'uz-Cyrl': `${ORIGIN}/kr/tag/cs2/page/2`,
      'x-default': `${ORIGIN}/tag/cs2/page/2`,
    })
    expect(String((metadata.title as { absolute: string }).absolute)).toContain('Блог Одя')
    expect(jsonLd[0]?.['@type']).toBe('BreadcrumbList')
  })
})

describe('muallif sahifasi SEO', () => {
  it('Person JSON-LD (url = muallif sahifasi, sameAs, worksFor) + breadcrumb', () => {
    const { metadata, jsonLd } = authorSeo(
      'uz-Latn',
      {
        slug: 'tahririyat',
        name: 'Blog Odya tahririyati',
        position: 'Tahririyat',
        bio: 'Bio',
        image: '/api/media/file/a.webp',
        sameAs: ['https://t.me/blogodya', 'javascript:alert(1)'],
      },
      1,
      opts,
    )
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/author/tahririyat`)
    expect(metadata.description).toBe('Bio')
    const person = jsonLd.find((item) => item['@type'] === 'Person')
    expect(person).toMatchObject({
      '@id': `${ORIGIN}/author/tahririyat#person`,
      url: `${ORIGIN}/author/tahririyat`,
      name: 'Blog Odya tahririyati',
      jobTitle: 'Tahririyat',
      image: `${ORIGIN}/api/media/file/a.webp`,
      sameAs: ['https://t.me/blogodya'],
      worksFor: { '@id': `${ORIGIN}/#organization` },
    })
    expect(jsonLd.some((item) => item['@type'] === 'BreadcrumbList')).toBe(true)
  })
})

describe('statik sahifa SEO', () => {
  const page = {
    id: 1,
    slug: 'aloqa',
    title: 'Aloqa',
    layout: [
      { blockType: 'content', richText: { root: { children: [] } } },
      {
        blockType: 'faq',
        items: [
          { question: 'Qanday bogʻlanaman?', answer: 'Email orqali.' },
          { question: ' ', answer: 'Boʻsh savol tashlanadi' },
        ],
      },
    ],
    meta: { title: 'Biz bilan aloqa', description: 'Tahririyat bilan aloqa', noindex: false },
    updatedAt: '',
    createdAt: '',
  } as unknown as Page

  it('meta sarlavha/tavsif, canonical, FAQPage', () => {
    const { metadata, jsonLd } = staticPageSeo('uz-Cyrl', page, opts)
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/kr/aloqa`)
    expect((metadata.title as { absolute: string }).absolute).toBe('Biz bilan aloqa — Блог Одя')
    expect(metadata.description).toBe('Tahririyat bilan aloqa')
    expect(pageFaqItems(page)).toHaveLength(2)
    const faq = jsonLd.find((item) => item['@type'] === 'FAQPage')
    expect((faq?.mainEntity as unknown[]).length).toBe(1)
  })

  it('meta.description bo‘lmasa — matnning boshi (Lighthouse "meta-description")', () => {
    const text = { root: { children: [{ children: [{ text: 'Tahririyat bilan bogʻlanish.' }] }] } }
    const bare = {
      ...page,
      meta: {},
      layout: [{ blockType: 'content', richText: text }],
    } as unknown as Page
    expect(staticPageSeo('uz-Latn', bare, opts).metadata.description).toBe(
      'Tahririyat bilan bogʻlanish.',
    )
  })

  it('meta.noindex → noindex', () => {
    const hidden = { ...page, meta: { noindex: true } } as Page
    expect(staticPageSeo('uz-Latn', hidden, opts).metadata.robots).toEqual({
      index: false,
      follow: true,
    })
  })
})

describe('qidiruv SEO', () => {
  it('har doim noindex, canonical — /search (so‘rovsiz)', () => {
    const metadata = searchMetadata('uz-Cyrl', 'сунъий', opts)
    expect(metadata.robots).toEqual({ index: false, follow: true })
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/kr/search`)
    expect((metadata.title as { absolute: string }).absolute).toContain('сунъий')
    expect(searchMetadata('uz-Latn', null, opts).robots).toEqual({ index: false, follow: true })
  })
})
