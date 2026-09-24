import { describe, expect, it } from 'vitest'

import { copyrightLine } from '@/components/blog/Footer'
import { TOP_LEVEL_RESERVED_SLUGS, validateSlug } from '@/lib/slug'
import type { Page } from '@/payload-types'
import {
  authorRevalidationTags,
  CACHE_TAGS,
  pageRevalidationTags,
  tagRevalidationTags,
} from '@/site/cache-tags'
import {
  cleanSearchQuery,
  isSearchableQuery,
  normalizeSearchText,
  SEARCH_QUERY_MAX_LENGTH,
} from '@/site/search-normalize'
import { authorSeo, pageFaqItems, searchMetadata, staticPageSeo, tagSeo } from '@/site/seo/pages'
import { parseSearchParams } from '@/site/views/SearchView'

const ORIGIN = 'https://blog.odya.uz'
const opts = { origin: ORIGIN, indexingAllowed: true }

describe('qidiruv normallashtirish (lotin ↔ kirill, apostroflar)', () => {
  it.each([
    // oʻ / o' / o‘ / o’ / o` — bitta ko'rinish
    ['Oʻzbekiston', 'ozbekiston'],
    ["O'zbekiston", 'ozbekiston'],
    ['O‘zbekiston', 'ozbekiston'],
    ['O’zbekiston', 'ozbekiston'],
    ['O`zbekiston', 'ozbekiston'],
    ['gʻalaba', 'galaba'],
    ['sunʼiy intellekt', 'suniy intellekt'],
    // Kirill → lotin
    ['Ўзбекистон', 'ozbekiston'],
    ['ЎЗБЕКИСТОН', 'ozbekiston'],
    ['ғалаба', 'galaba'],
    ['Сунъий интеллект', 'suniy intellekt'],
    ['қишлоқ хўжалиги', 'qishloq xojaligi'],
    ['ҳокимият', 'hokimiyat'],
    ['чемпионат', 'chempionat'],
    ['шахмат', 'shaxmat'],
    ['ёшлар', 'yoshlar'],
    ['юлдуз', 'yulduz'],
    ['цирк', 'tsirk'],
    ['Европа', 'evropa'],
    ['Yevropa', 'evropa'],
    ['мактаб', 'maktab'],
    // Tinish belgilar va bo'shliqlar
    ['  CS2 — "Major" finali!  ', 'cs2 major finali'],
    ['iPhone 18 Pro', 'iphone 18 pro'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected)
  })

  it('lotin va kirill yozuvi bir xil natija beradi', () => {
    expect(normalizeSearchText('Oʻzbekistonda sunʼiy intellekt')).toBe(
      normalizeSearchText('Ўзбекистонда сунъий интеллект'),
    )
  })

  it('so‘rovni tozalash va minimal uzunlik', () => {
    expect(cleanSearchQuery('  a   b  ')).toBe('a b')
    expect(cleanSearchQuery(['x', 'y'])).toBe('x')
    expect(cleanSearchQuery(undefined)).toBe('')
    expect([...cleanSearchQuery('я'.repeat(500))]).toHaveLength(SEARCH_QUERY_MAX_LENGTH)
    expect(isSearchableQuery('a')).toBe(false)
    expect(isSearchableQuery("'ʻ")).toBe(false)
    expect(isSearchableQuery('ai')).toBe(true)
    expect(isSearchableQuery('ўз')).toBe(true)
  })

  it('searchParams: sahifa raqami va chegarasi', () => {
    expect(parseSearchParams({ q: ' ai ', page: '3' })).toEqual({ query: 'ai', page: 3 })
    expect(parseSearchParams({ q: 'ai', page: 'abc' })).toEqual({ query: 'ai', page: 1 })
    expect(parseSearchParams({ q: 'ai', page: '9999' }).page).toBe(50)
    expect(parseSearchParams({})).toEqual({ query: '', page: 1 })
  })
})

describe('slug: ildiz darajasidagi band marshrutlar (M1-07)', () => {
  it.each(['kr', 'tag', 'author', 'search', 'bot', 'page', 'admin', 'api', 'feeds', 'og'])(
    '%s — kategoriya/sahifa uchun band',
    (slug) => {
      expect(validateSlug(slug, { topLevel: true })).not.toBe(true)
    },
  )

  it('teg/post slug’lari uchun faqat asosiy band ro‘yxat', () => {
    expect(validateSlug('search')).toBe(true)
    expect(validateSlug('bot')).toBe(true)
    expect(validateSlug('kr')).not.toBe(true)
    expect(validateSlug('biz-haqimizda', { topLevel: true })).toBe(true)
  })

  it('band ro‘yxat haqiqiy papkalar va seed kategoriyalari bilan to‘qnashmaydi', () => {
    expect(TOP_LEVEL_RESERVED_SLUGS).not.toContain('kibersport')
    expect(new Set(TOP_LEVEL_RESERVED_SLUGS).size).toBe(TOP_LEVEL_RESERVED_SLUGS.length)
  })
})

describe('kesh teglari: teg, muallif, sahifa (M1-07)', () => {
  it('teg/muallif — o‘zi (eski va yangi slug) + posts', () => {
    expect(tagRevalidationTags({ slug: 'cs2' }, { slug: 'counter-strike' }).sort()).toEqual(
      [CACHE_TAGS.posts, 'tag:counter-strike', 'tag:cs2'].sort(),
    )
    expect(authorRevalidationTags({ slug: 'tahririyat' })).toEqual([
      CACHE_TAGS.posts,
      'author:tahririyat',
    ])
  })

  it('sahifa: chop etilgan — pages, nav, page:{slug}; hech qachon chop etilmagan qoralama — yo‘q', () => {
    expect(pageRevalidationTags({ slug: 'aloqa', _status: 'published' }).sort()).toEqual(
      [CACHE_TAGS.nav, CACHE_TAGS.pages, 'page:aloqa'].sort(),
    )
    expect(pageRevalidationTags({ slug: 'yangi', _status: 'draft' })).toEqual([])
    // Unpublish — eski ommaviy holat yangilanadi.
    expect(
      pageRevalidationTags(
        { slug: 'aloqa', _status: 'draft' },
        { slug: 'aloqa', _status: 'published' },
      ),
    ).toContain('page:aloqa')
  })
})

describe('SEO: teg, muallif, statik sahifa, qidiruv (M1-07)', () => {
  const tag = {
    slug: 'cs2',
    name: 'CS2',
    description: null,
    metaTitle: null,
    metaDescription: null,
  }

  it('teg: < 3 post — noindex, ≥ 3 — indekslanadi; canonical o‘ziga, hreflang', () => {
    const few = tagSeo('uz-Latn', { ...tag, postCount: 2 }, 1, opts).metadata
    expect(few.robots).toEqual({ index: false, follow: true })
    expect(few.alternates?.canonical).toBe(`${ORIGIN}/tag/cs2`)
    expect(few.description).toContain('CS2')

    const many = tagSeo('uz-Cyrl', { ...tag, postCount: 3 }, 2, opts)
    expect(many.metadata.robots).toBeUndefined()
    expect(many.metadata.alternates?.canonical).toBe(`${ORIGIN}/kr/tag/cs2/page/2`)
    expect(many.metadata.alternates?.languages).toMatchObject({
      'uz-Latn': `${ORIGIN}/tag/cs2/page/2`,
      'x-default': `${ORIGIN}/tag/cs2/page/2`,
    })
    expect(String((many.metadata.title as { absolute: string }).absolute)).toMatch(/— Блог Одя$/)
    // meta.noindex — post sonidan qat'i nazar
    expect(
      tagSeo('uz-Latn', { ...tag, noindex: true, postCount: 10 }, 1, opts).metadata.robots,
    ).toEqual({ index: false, follow: true })
  })

  it('muallif: Person JSON-LD (sameAs, jobTitle), breadcrumb', () => {
    const { metadata, jsonLd } = authorSeo(
      'uz-Latn',
      {
        slug: 'tahririyat',
        name: 'Tahririyat',
        position: 'Muharrir',
        bio: null,
        avatarUrl: '/api/media/file/a.png',
        socials: [{ url: 'https://t.me/blogodya' }],
      },
      1,
      opts,
    )
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/author/tahririyat`)
    expect(metadata.description).toContain('Tahririyat')
    expect(jsonLd[0]).toMatchObject({
      '@type': 'Person',
      name: 'Tahririyat',
      jobTitle: 'Muharrir',
      url: `${ORIGIN}/author/tahririyat`,
      image: `${ORIGIN}/api/media/file/a.png`,
      sameAs: ['https://t.me/blogodya'],
    })
    expect(jsonLd[1]).toMatchObject({ '@type': 'BreadcrumbList' })
  })

  const page = {
    slug: 'aloqa',
    title: 'Aloqa',
    updatedAt: '',
    meta: { noindex: false },
    layout: [
      {
        blockType: 'content' as const,
        richText: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                version: 1,
                children: [{ type: 'text', text: 'Biz bilan bogʻlanish.', version: 1 }],
              },
            ],
            direction: null,
            format: '' as const,
            indent: 0,
            version: 1,
          },
        },
      },
      {
        blockType: 'faq' as const,
        items: [{ question: 'Savol?', answer: 'Javob.' }],
      },
    ],
  } as unknown as Page

  it('statik sahifa: description matndan, FAQPage, kirill canonical', () => {
    const { metadata, jsonLd } = staticPageSeo('uz-Cyrl', page, opts)
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/kr/aloqa`)
    expect(metadata.description).toBe('Biz bilan bogʻlanish.')
    expect(jsonLd.map((item) => item['@type'])).toEqual(['BreadcrumbList', 'FAQPage'])
    expect(pageFaqItems(page)).toEqual([{ question: 'Savol?', answer: 'Javob.' }])
  })

  it('qidiruv: har doim noindex, canonical so‘rovsiz', () => {
    const metadata = searchMetadata('uz-Cyrl', 'ai', opts)
    expect(metadata.robots).toEqual({ index: false, follow: true })
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/kr/search`)
    expect(String((metadata.title as { absolute: string }).absolute)).toContain('«ai»')
  })
})

describe('footer mualliflik qatori', () => {
  it('yil qo‘shiladi', () => {
    expect(copyrightLine('© Odya LLC', 2026)).toBe('© 2026 Odya LLC')
    expect(copyrightLine(null, 2026)).toBe('© 2026 Odya LLC')
    expect(copyrightLine('Odya LLC', 2026)).toBe('© 2026 Odya LLC')
  })
})
