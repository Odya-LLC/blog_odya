import { describe, expect, it } from 'vitest'

import { resolveSiteRoute } from '@/site/route'

describe('sayt marshrutlari ([[...path]], TZ §8.1)', () => {
  it.each([
    [undefined, { kind: 'home' }],
    [[], { kind: 'home' }],
    [['kibersport'], { kind: 'category', category: 'kibersport', page: 1 }],
    [['kibersport', 'page', '2'], { kind: 'category', category: 'kibersport', page: 2 }],
    [['kibersport', 'page', '1'], { kind: 'category-first-page', category: 'kibersport' }],
    [
      ['kibersport', 'major-final'],
      { kind: 'article', category: 'kibersport', slug: 'major-final' },
    ],
    // `/{category}/page` — `page` slug'li maqola sifatida qidiriladi (topilmasa — 404)
    [['kibersport', 'page'], { kind: 'article', category: 'kibersport', slug: 'page' }],
    // OdyaBlogBot sahifasi (User-Agent'dagi havola).
    [['bot'], { kind: 'bot' }],
    // M1-07: teg va muallif (sahifalash bilan); statik sahifa — `[slug]` (kategoriya bilan bitta
    // nomlar fazosi, ko'rinish qatlamida hal qilinadi).
    [['tag', 'chatgpt'], { kind: 'tag', slug: 'chatgpt', page: 1 }],
    [['tag', 'chatgpt', 'page', '3'], { kind: 'tag', slug: 'chatgpt', page: 3 }],
    [
      ['tag', 'chatgpt', 'page', '1'],
      { kind: 'listing-first-page', listing: 'tag', slug: 'chatgpt' },
    ],
    [['author', 'tahririyat'], { kind: 'author', slug: 'tahririyat', page: 1 }],
    [['author', 'tahririyat', 'page', '2'], { kind: 'author', slug: 'tahririyat', page: 2 }],
    [
      ['author', 'tahririyat', 'page', '1'],
      { kind: 'listing-first-page', listing: 'author', slug: 'tahririyat' },
    ],
    [['biz-haqimizda'], { kind: 'category', category: 'biz-haqimizda', page: 1 }],
  ] as const)('%j', (segments, expected) => {
    expect(resolveSiteRoute(segments as string[] | undefined)).toEqual(expected)
  })

  it.each([
    [['kibersport', 'page', '0']],
    [['kibersport', 'page', 'abc']],
    [['kibersport', 'sahifa', '2']],
    [['a', 'b', 'c', 'd']],
    [['wp-login.php']],
    [['Kibersport']],
    [['kibersport', '%D0%B0']],
    [['kibersport', 'slug_with_underscore']],
    [['']],
    // Teg/muallif: slug'siz, noto'g'ri sahifalash, ortiqcha segmentlar.
    [['tag']],
    [['author']],
    [['tag', 'Katta']],
    [['tag', 'x', 'page']],
    [['tag', 'x', 'page', '0']],
    [['tag', 'x', 'sahifa', '2']],
    [['tag', 'x', 'page', '2', 'y']],
    [['author', 'x', 'extra']],
  ])('404: %j', (segments) => {
    expect(resolveSiteRoute(segments)).toEqual({ kind: 'not-found' })
  })
})
