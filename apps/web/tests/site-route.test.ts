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
  ])('404: %j', (segments) => {
    expect(resolveSiteRoute(segments)).toEqual({ kind: 'not-found' })
  })
})
