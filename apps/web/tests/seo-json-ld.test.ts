import type { Locale } from '@blog-odya/shared'
import { describe, expect, it } from 'vitest'

import type { Author, Category, Media, Post, Tag } from '@/payload-types'
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  HEADLINE_MAX,
  type JsonLdObject,
  newsArticleJsonLd,
  organizationJsonLd,
  personJsonLd,
  serializeJsonLd,
  websiteJsonLd,
} from '@/site/seo/json-ld'
import { articleSeo } from '@/site/seo/pages'

const ORIGIN = 'https://blog.odya.uz'
const ABSOLUTE_URL = /^https:\/\/blog\.odya\.uz\//
/** ISO 8601, vaqt mintaqasi bilan (Google: timezone tavsiya etiladi). */
const ISO_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

const category = {
  id: 1,
  name: 'Kibersport',
  slug: 'kibersport',
  color: '#7F5239',
  updatedAt: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
} as Category

const author = {
  id: 1,
  name: 'Blog Odya tahririyati',
  slug: 'tahririyat',
  position: 'Tahririyat',
  socials: [{ platform: 'telegram', url: 'https://t.me/blogodya' }],
  updatedAt: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
} as Author

const cover = {
  id: 5,
  alt: 'Muqova',
  url: 'https://media.odya.uz/cover.png',
  width: 1920,
  height: 1080,
  mimeType: 'image/png',
  sizes: {
    og: {
      url: 'https://media.odya.uz/cover-1200x630.webp',
      width: 1200,
      height: 630,
      mimeType: 'image/webp',
    },
  },
} as Media

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 10,
    title: 'Oʻzbek jamoasi CS2 turnirida gʻalaba qozondi',
    slug: 'ozbek-jamoasi-cs2-turnirida-galaba',
    excerpt: 'Lid matni',
    category,
    authors: [author],
    tags: [{ id: 1, name: 'CS2', slug: 'cs2' } as Tag],
    sources: [{ name: 'HLTV', url: 'https://www.hltv.org/news/1/x' }],
    faq: [{ question: 'Qachon?', answer: 'Kecha.' }],
    publishedAt: '2026-09-24T08:00:00.000Z',
    updatedAt: '2026-09-24T09:30:00.000Z',
    createdAt: '2026-09-24T07:00:00.000Z',
    workflowStatus: 'published',
    ...overrides,
  } as Post
}

function byType(items: JsonLdObject[], type: string): JsonLdObject {
  const found = items.find((item) => item['@type'] === type)
  if (!found) throw new Error(`${type} yo‘q`)
  return found
}

/**
 * Google Article structured data (developers.google.com/search/docs/appearance/structured-data/article):
 * majburiy xususiyat yo'q, tavsiya etilganlari — author (name, url), dateModified, datePublished,
 * headline, image. Rich Results Test xato bermasligi uchun: to'liq URL'lar, ISO sanalar, `@context`.
 */
function expectValidNewsArticle(article: JsonLdObject, locale: Locale, path: string) {
  expect(article['@context']).toBe('https://schema.org')
  expect(article['@type']).toBe('NewsArticle')
  expect(article.url).toBe(`${ORIGIN}${path}`)
  expect(article.mainEntityOfPage).toEqual({ '@type': 'WebPage', '@id': `${ORIGIN}${path}` })
  expect(typeof article.headline).toBe('string')
  expect((article.headline as string).length).toBeGreaterThan(0)
  expect([...(article.headline as string)].length).toBeLessThanOrEqual(HEADLINE_MAX)
  const images = article.image as string[]
  expect(images.length).toBeGreaterThan(0)
  for (const image of images) expect(image).toMatch(/^https:\/\//)
  expect(article.datePublished).toMatch(ISO_WITH_TZ)
  expect(article.dateModified).toMatch(ISO_WITH_TZ)
  expect(Date.parse(article.dateModified as string)).toBeGreaterThanOrEqual(
    Date.parse(article.datePublished as string),
  )
  const authors = article.author as Array<Record<string, unknown>>
  expect(authors.length).toBeGreaterThan(0)
  for (const person of authors) {
    expect(['Person', 'NewsMediaOrganization']).toContain(person['@type'])
    expect(typeof person.name).toBe('string')
    expect(person.url).toMatch(ABSOLUTE_URL)
  }
  const publisher = article.publisher as Record<string, unknown>
  expect(publisher.name).toBeTruthy()
  expect((publisher.logo as Record<string, unknown>).url).toMatch(ABSOLUTE_URL)
  expect(article.inLanguage).toBe(locale)
}

describe('NewsArticle (TZ §8.2)', () => {
  for (const locale of ['uz-Latn', 'uz-Cyrl'] as const) {
    it(`${locale}: Google tavsiya etgan xususiyatlar, inLanguage, isBasedOn`, () => {
      const { jsonLd } = articleSeo(
        locale,
        { post: makePost({ coverImage: cover }), category },
        {
          origin: ORIGIN,
        },
      )
      const prefix = locale === 'uz-Cyrl' ? '/kr' : ''
      const path = `${prefix}/kibersport/ozbek-jamoasi-cs2-turnirida-galaba`
      const article = byType(jsonLd, 'NewsArticle')
      expectValidNewsArticle(article, locale, path)
      expect(article.isBasedOn).toBe('https://www.hltv.org/news/1/x')
      expect(article.image).toEqual([
        'https://media.odya.uz/cover.png',
        'https://media.odya.uz/cover-1200x630.webp',
      ])
      expect(article.author).toEqual([
        expect.objectContaining({
          '@type': 'Person',
          name: 'Blog Odya tahririyati',
          url: `${ORIGIN}${prefix}/author/tahririyat`,
          jobTitle: 'Tahririyat',
          sameAs: ['https://t.me/blogodya'],
        }),
      ])
      expect(article.articleSection).toBe('Kibersport')
      expect(article.keywords).toEqual(['CS2'])

      const breadcrumb = byType(jsonLd, 'BreadcrumbList')
      const items = breadcrumb.itemListElement as Array<Record<string, unknown>>
      expect(items.map((item) => item.position)).toEqual([1, 2, 3])
      expect(items.map((item) => item.item)).toEqual([
        `${ORIGIN}${prefix || '/'}`,
        `${ORIGIN}${prefix}/kibersport`,
        `${ORIGIN}${path}`,
      ])
      expect(byType(jsonLd, 'FAQPage').mainEntity).toEqual([
        {
          '@type': 'Question',
          name: 'Qachon?',
          acceptedAnswer: { '@type': 'Answer', text: 'Kecha.' },
        },
      ])
    })
  }

  it('muqova yo‘q — avtomatik OG rasm (next/og) og:image va JSON-LD image’da', () => {
    const { metadata, jsonLd } = articleSeo(
      'uz-Cyrl',
      { post: makePost({ coverImage: null }), category },
      { origin: ORIGIN },
    )
    const images = byType(jsonLd, 'NewsArticle').image as string[]
    expect(images).toHaveLength(1)
    expect(images[0]).toMatch(
      /^https:\/\/blog\.odya\.uz\/og\/cyrl\/post\/ozbek-jamoasi-cs2-turnirida-galaba\?v=[0-9a-z]+$/,
    )
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: images[0], width: 1200, height: 630, type: 'image/png' }),
    ])
  })

  it('muallifsiz — Organization, bitta manbasiz — isBasedOn yo‘q, FAQ bo‘lmasa FAQPage yo‘q', () => {
    const { jsonLd } = articleSeo(
      'uz-Latn',
      { post: makePost({ authors: [], sources: [], faq: [] }), category },
      { origin: ORIGIN },
    )
    const article = byType(jsonLd, 'NewsArticle')
    expectValidNewsArticle(article, 'uz-Latn', '/kibersport/ozbek-jamoasi-cs2-turnirida-galaba')
    expect(article.isBasedOn).toBeUndefined()
    expect(jsonLd.some((item) => item['@type'] === 'FAQPage')).toBe(false)
  })

  it('bir nechta manba — isBasedOn massiv; uzun sarlavha ≤ 110 belgi', () => {
    const article = newsArticleJsonLd({
      locale: 'uz-Latn',
      path: '/a/b',
      headline: 'x'.repeat(200),
      images: [`${ORIGIN}/og/latn/post/b`],
      datePublished: '2026-09-24T08:00:00Z',
      authors: [],
      sources: ['https://a.example/1', 'https://b.example/2', 'https://a.example/1', 'ftp://x'],
      origin: ORIGIN,
    })
    expect(article.isBasedOn).toEqual(['https://a.example/1', 'https://b.example/2'])
    expect([...(article.headline as string)].length).toBe(HEADLINE_MAX)
    expect(article.dateModified).toBe('2026-09-24T08:00:00.000Z')
  })

  it('meta.noindex — robots noindex', () => {
    const { metadata } = articleSeo(
      'uz-Latn',
      { post: makePost({ meta: { noindex: true } }), category },
      { origin: ORIGIN, indexingAllowed: true },
    )
    expect(metadata.robots).toEqual({ index: false, follow: true })
  })
})

describe('Organization, WebSite + SearchAction, Person, Breadcrumb, FAQ', () => {
  it('Organization: nom, logo (to‘liq URL), sameAs faqat http(s)', () => {
    const org = organizationJsonLd('uz-Cyrl', {
      sameAs: ['https://t.me/blogodya', 'javascript:alert(1)'],
      origin: ORIGIN,
    })
    expect(org).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'NewsMediaOrganization',
      '@id': `${ORIGIN}/#organization`,
      name: 'Блог Одя',
      alternateName: 'Blog Odya',
      legalName: 'Odya LLC',
      url: `${ORIGIN}/kr`,
      sameAs: ['https://t.me/blogodya'],
    })
    expect((org.logo as Record<string, unknown>).url).toBe(`${ORIGIN}/brand/icon-512.png`)
  })

  it('WebSite: SearchAction — /search?q= va /kr/search?q=', () => {
    for (const [locale, path] of [
      ['uz-Latn', '/search'],
      ['uz-Cyrl', '/kr/search'],
    ] as const) {
      const site = websiteJsonLd(locale, { origin: ORIGIN })
      const action = site.potentialAction as Record<string, unknown>
      expect(action['@type']).toBe('SearchAction')
      expect((action.target as Record<string, unknown>).urlTemplate).toBe(
        `${ORIGIN}${path}?q={search_term_string}`,
      )
      expect(action['query-input']).toBe('required name=search_term_string')
      expect(site.inLanguage).toBe(locale)
      expect(site.publisher).toEqual({ '@id': `${ORIGIN}/#organization` })
    }
  })

  it('Person (muallif sahifasi, M1-07)', () => {
    expect(
      personJsonLd(
        {
          name: 'Ali',
          path: '/kr/author/ali',
          jobTitle: 'Muharrir',
          sameAs: ['https://x.com/ali'],
        },
        ORIGIN,
      ),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': `${ORIGIN}/kr/author/ali#person`,
      url: `${ORIGIN}/kr/author/ali`,
      name: 'Ali',
      jobTitle: 'Muharrir',
      sameAs: ['https://x.com/ali'],
      worksFor: { '@id': `${ORIGIN}/#organization` },
    })
  })

  it('BreadcrumbList: position 1 dan, item — to‘liq URL', () => {
    const list = breadcrumbJsonLd(
      [
        { name: 'Bosh sahifa', path: '/' },
        { name: 'Kibersport', path: '/kibersport' },
      ],
      ORIGIN,
    )
    expect(list.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Bosh sahifa', item: `${ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Kibersport', item: `${ORIGIN}/kibersport` },
    ])
  })

  it('FAQPage: bo‘sh savol/javoblar tashlanadi, hammasi bo‘sh bo‘lsa — null', () => {
    expect(faqPageJsonLd([{ question: ' ', answer: 'x' }])).toBeNull()
    expect(faqPageJsonLd(null)).toBeNull()
    expect(
      (
        faqPageJsonLd([
          { question: 'S?', answer: 'J.' },
          { question: '', answer: 'x' },
        ])?.mainEntity as unknown[]
      ).length,
    ).toBe(1)
  })

  it('serializeJsonLd: </script> va U+2028 qochiriladi, JSON sifatida qayta o‘qiladi', () => {
    const data = { '@type': 'Thing', name: `</script><b>&${String.fromCharCode(0x2028)}` }
    const html = serializeJsonLd(data)
    expect(html).not.toContain('</script>')
    expect(html).not.toContain('<')
    expect(html).not.toContain(String.fromCharCode(0x2028))
    expect(JSON.parse(html)).toEqual(data)
  })
})
