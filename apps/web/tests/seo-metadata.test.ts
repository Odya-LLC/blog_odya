import { LOCALES, type Locale } from '@blog-odya/shared'
import { describe, expect, it } from 'vitest'

import { categoryPath, homePath, postPath } from '@/site/paths'
import { isIndexingAllowed, siteOrigin, TAG_INDEX_MIN_POSTS } from '@/site/seo/config'
import {
  buildPageMetadata,
  generatedOgPath,
  hreflangUrls,
  isTagIndexable,
  localeAlternates,
  mediaOgImage,
  metaDescription,
  robotsMeta,
  tagRobots,
  versionToken,
  withBrand,
  withoutBrand,
} from '@/site/seo/metadata'
import { categorySeo, homeSeo, rootLayoutMetadata } from '@/site/seo/pages'

const ORIGIN = 'https://blog.odya.uz'

/** Ikkala yozuvdagi sahifa turlari (TZ §8.1). */
const PAGES: Array<(locale: Locale) => string> = [
  (locale) => homePath(locale),
  (locale) => categoryPath(locale, 'kibersport'),
  (locale) => categoryPath(locale, 'kibersport', 3),
  (locale) => postPath(locale, 'kibersport', 'cs2-major-final'),
  (locale) => `${locale === 'uz-Cyrl' ? '/kr' : ''}/tag/cs2`,
]

describe('hreflang (TZ §3.6, §8.2)', () => {
  it('uz-Latn, uz-Cyrl va x-default (→ lotin), to‘liq URL', () => {
    expect(hreflangUrls('/kibersport/x', ORIGIN)).toEqual({
      'uz-Latn': `${ORIGIN}/kibersport/x`,
      'uz-Cyrl': `${ORIGIN}/kr/kibersport/x`,
      'x-default': `${ORIGIN}/kibersport/x`,
    })
    expect(hreflangUrls('/', ORIGIN)).toEqual({
      'uz-Latn': `${ORIGIN}/`,
      'uz-Cyrl': `${ORIGIN}/kr`,
      'x-default': `${ORIGIN}/`,
    })
  })

  it('juftliklar o‘zaro to‘g‘ri: har bir versiya canonical — o‘zi, alternates — bir xil to‘plam', () => {
    for (const page of PAGES) {
      const byLocale = Object.fromEntries(
        LOCALES.map((locale) => [locale, localeAlternates(locale, page(locale), ORIGIN)]),
      ) as Record<Locale, ReturnType<typeof localeAlternates>>
      for (const locale of LOCALES) {
        const { canonical, languages } = byLocale[locale]
        // Canonical — o'zi (manbaga yoki boshqa yozuvga emas).
        expect(canonical).toBe(`${ORIGIN}${page(locale)}`)
        // O'ziga qaytuvchi hreflang.
        expect(languages[locale]).toBe(canonical)
        expect(languages['x-default']).toBe(byLocale['uz-Latn'].canonical)
        for (const other of LOCALES) {
          // A → B bo'lsa, B → A ham (reciprocity) va to'plamlar bir xil.
          expect(languages[other]).toBe(byLocale[other].canonical)
          expect(byLocale[other].languages[locale]).toBe(canonical)
          expect(byLocale[other].languages).toEqual(languages)
        }
      }
    }
  })

  it('metadata `alternates` Next.js formatida', () => {
    const metadata = buildPageMetadata({
      locale: 'uz-Cyrl',
      path: '/kr/kibersport',
      title: 'Киберспорт',
      origin: ORIGIN,
      indexingAllowed: true,
    })
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/kr/kibersport`)
    expect(metadata.alternates?.languages).toEqual({
      'uz-Latn': `${ORIGIN}/kibersport`,
      'uz-Cyrl': `${ORIGIN}/kr/kibersport`,
      'x-default': `${ORIGIN}/kibersport`,
    })
  })
})

describe('title (TZ §8.2)', () => {
  it('`{seoTitle} — Blog Odya` / `— Блог Одя`', () => {
    expect(withBrand('CS2 finali', 'uz-Latn')).toBe('CS2 finali — Blog Odya')
    expect(withBrand('CS2 финали', 'uz-Cyrl')).toBe('CS2 финали — Блог Одя')
  })

  it('mavjud brend qo‘shimchasi almashtiriladi (plugin-seo / lotin fallback)', () => {
    expect(withBrand('CS2 finali — Blog Odya', 'uz-Latn')).toBe('CS2 finali — Blog Odya')
    expect(withBrand('CS2 finali — Blog Odya', 'uz-Cyrl')).toBe('CS2 finali — Блог Одя')
    expect(withBrand('X | Blog Odya', 'uz-Latn')).toBe('X — Blog Odya')
    expect(withBrand('', 'uz-Cyrl')).toBe('Блог Одя')
    expect(withBrand('Blog Odya', 'uz-Cyrl')).toBe('Блог Одя')
    expect(withoutBrand('CS2 finali — Blog Odya', 'uz-Latn')).toBe('CS2 finali')
  })

  it('metadata: `title.absolute` (layout shabloni qo‘shilmaydi)', () => {
    const metadata = buildPageMetadata({
      locale: 'uz-Latn',
      path: '/kibersport',
      title: 'Kibersport',
      origin: ORIGIN,
    })
    expect(metadata.title).toEqual({ absolute: 'Kibersport — Blog Odya' })
  })
})

describe('description', () => {
  it('bo‘shliqlar siqiladi, uzun matn so‘z chegarasida qisqartiriladi', () => {
    expect(metaDescription('  a \n b  ')).toBe('a b')
    expect(metaDescription('')).toBeUndefined()
    const long = 'soʻz '.repeat(60)
    const result = metaDescription(long)!
    expect([...result].length).toBeLessThanOrEqual(160)
    expect(result.endsWith('…')).toBe(true)
  })
})

describe('OpenGraph va Twitter Card', () => {
  const image = {
    url: `${ORIGIN}/og/latn/post/x?v=abc`,
    width: 1200,
    height: 630,
    alt: 'X',
    type: 'image/png',
  }

  it('maqola: og:type=article, og:locale=uz_UZ, article:*, summary_large_image', () => {
    const metadata = buildPageMetadata({
      locale: 'uz-Latn',
      path: '/kibersport/x',
      title: 'X',
      description: 'Lid',
      type: 'article',
      image,
      article: {
        publishedTime: '2026-09-24T08:00:00.000Z',
        modifiedTime: '2026-09-24T09:00:00.000Z',
        section: 'Kibersport',
        tags: ['CS2'],
        authors: [`${ORIGIN}/author/tahririyat`],
      },
      origin: ORIGIN,
      indexingAllowed: true,
    })
    expect(metadata.openGraph).toMatchObject({
      type: 'article',
      url: `${ORIGIN}/kibersport/x`,
      locale: 'uz_UZ',
      siteName: 'Blog Odya',
      title: 'X',
      description: 'Lid',
      publishedTime: '2026-09-24T08:00:00.000Z',
      modifiedTime: '2026-09-24T09:00:00.000Z',
      section: 'Kibersport',
      tags: ['CS2'],
      images: [image],
    })
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image', title: 'X' })
    expect(metadata.robots).toBeUndefined()
  })

  it('kirill: siteName — Блог Одя, og:locale — uz_UZ', () => {
    const metadata = buildPageMetadata({
      locale: 'uz-Cyrl',
      path: '/kr',
      title: 'Блог Одя — шиор',
      absoluteTitle: true,
      origin: ORIGIN,
    })
    expect(metadata.title).toEqual({ absolute: 'Блог Одя — шиор' })
    expect(metadata.openGraph).toMatchObject({ siteName: 'Блог Одя', locale: 'uz_UZ' })
  })

  it('RSS lentasi `<link rel="alternate" type="application/rss+xml">`', () => {
    const { metadata } = categorySeo(
      'uz-Cyrl',
      {
        slug: 'kibersport',
        name: 'Киберспорт',
        description: null,
        metaTitle: null,
        metaDescription: null,
      },
      1,
      { origin: ORIGIN, indexingAllowed: true },
    )
    expect(metadata.alternates?.types).toEqual({
      'application/rss+xml': [
        { url: `${ORIGIN}/kr/kibersport/rss.xml`, title: 'Киберспорт — Блог Одя' },
      ],
    })
  })

  it('media: `og` varianti (1200×630), nisbiy URL → to‘liq', () => {
    expect(
      mediaOgImage(
        {
          url: '/api/media/file/a.png',
          width: 2000,
          height: 1000,
          alt: 'Alt',
          mimeType: 'image/png',
          sizes: {
            og: {
              url: '/api/media/file/a-1200x630.webp',
              width: 1200,
              height: 630,
              mimeType: 'image/webp',
            },
          },
        },
        ORIGIN,
      ),
    ).toEqual({
      url: `${ORIGIN}/api/media/file/a-1200x630.webp`,
      width: 1200,
      height: 630,
      alt: 'Alt',
      type: 'image/webp',
    })
    expect(mediaOgImage(null, ORIGIN)).toBeNull()
  })

  it('avtomatik OG yo‘li (next/og) + kesh-buzar', () => {
    expect(generatedOgPath('uz-Latn', { kind: 'post', slug: 'x' }, 'v1')).toBe(
      '/og/latn/post/x?v=v1',
    )
    expect(generatedOgPath('uz-Cyrl', { kind: 'category', slug: 'kibersport' })).toBe(
      '/og/cyrl/category/kibersport',
    )
    expect(generatedOgPath('uz-Cyrl', { kind: 'site' })).toBe('/og/cyrl')
    expect(versionToken('2026-09-24T08:00:00.000Z')).toMatch(/^[0-9a-z]+$/)
    expect(versionToken(null)).toBeUndefined()
  })

  it('kategoriya: sahifalashda canonical o‘ziga, title’da sahifa raqami', () => {
    const { metadata, jsonLd } = categorySeo(
      'uz-Latn',
      {
        slug: 'kibersport',
        name: 'Kibersport',
        description: 'Tavsif',
        metaTitle: 'Kibersport yangiliklari — Blog Odya',
        metaDescription: null,
      },
      2,
      { origin: ORIGIN, indexingAllowed: true },
    )
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/kibersport/page/2`)
    expect(metadata.title).toEqual({ absolute: 'Kibersport yangiliklari (2-sahifa) — Blog Odya' })
    expect(metadata.description).toBe('Tavsif')
    expect(jsonLd[0]?.['@type']).toBe('BreadcrumbList')
  })

  it('bosh sahifa: Organization + WebSite JSON-LD, default OG — next/og', () => {
    const { metadata, jsonLd } = homeSeo('uz-Latn', {}, { origin: ORIGIN, indexingAllowed: true })
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/`)
    expect(jsonLd.map((item) => item['@type'])).toEqual(['NewsMediaOrganization', 'WebSite'])
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({ url: `${ORIGIN}/og/latn`, width: 1200, height: 630 }),
    ])
  })
})

describe('indekslash: noindex va preview (TZ §8.3)', () => {
  it('isIndexingAllowed: Vercel preview/development — yopiq, production — ochiq', () => {
    expect(isIndexingAllowed({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(isIndexingAllowed({ VERCEL_ENV: 'development' })).toBe(false)
    expect(isIndexingAllowed({ VERCEL_ENV: 'production' })).toBe(true)
    expect(isIndexingAllowed({})).toBe(true)
    expect(isIndexingAllowed({ SEO_NOINDEX: '1' })).toBe(false)
    expect(isIndexingAllowed({ SEO_NOINDEX: 'true', VERCEL_ENV: 'production' })).toBe(false)
    expect(isIndexingAllowed({ SEO_NOINDEX: '0' })).toBe(true)
  })

  it('robots meta: preview — noindex, nofollow (sahifa sozlamasidan qat’i nazar)', () => {
    expect(robotsMeta(false, false)).toEqual({ index: false, follow: false })
    expect(robotsMeta(true, true)).toEqual({ index: false, follow: true })
    expect(robotsMeta(false, true)).toBeUndefined()
    const metadata = buildPageMetadata({
      locale: 'uz-Latn',
      path: '/',
      title: 'X',
      origin: ORIGIN,
      indexingAllowed: false,
    })
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('root layout: preview’da barcha sahifalar noindex', () => {
    expect(
      rootLayoutMetadata('uz-Latn', { origin: ORIGIN, indexingAllowed: false }).robots,
    ).toEqual({ index: false, follow: false })
    expect(
      rootLayoutMetadata('uz-Cyrl', { origin: ORIGIN, indexingAllowed: true }).robots,
    ).toBeUndefined()
  })

  it(`teg: < ${TAG_INDEX_MIN_POSTS} post — noindex (M1-07 bilan umumiy helper)`, () => {
    expect(TAG_INDEX_MIN_POSTS).toBe(3)
    expect(isTagIndexable(0)).toBe(false)
    expect(isTagIndexable(2)).toBe(false)
    expect(isTagIndexable(3)).toBe(true)
    expect(tagRobots(2, false, true)).toEqual({ index: false, follow: true })
    expect(tagRobots(3, false, true)).toBeUndefined()
    expect(tagRobots(10, true, true)).toEqual({ index: false, follow: true })
    expect(tagRobots(10, false, false)).toEqual({ index: false, follow: false })
  })
})

describe('sayt manzili', () => {
  it('NEXT_PUBLIC_SITE_URL → origin (oxirgi `/` siz), noto‘g‘ri qiymat — localhost', () => {
    expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: 'https://blog.odya.uz/' })).toBe(ORIGIN)
    expect(siteOrigin({})).toBe('http://localhost:3000')
    expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: 'not a url' })).toBe('http://localhost:3000')
  })
})
