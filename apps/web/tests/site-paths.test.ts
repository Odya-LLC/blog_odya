import { describe, expect, it } from 'vitest'

import {
  alternatePaths,
  categoryPath,
  homePath,
  localeFromPathname,
  localizePath,
  pagePath,
  parsePageParam,
  postPath,
  stripLocalePrefix,
  tagPath,
} from '@/site/paths'

describe('URL sxemasi (TZ §8.1)', () => {
  it('bosh sahifa: / va /kr', () => {
    expect(homePath('uz-Latn')).toBe('/')
    expect(homePath('uz-Cyrl')).toBe('/kr')
  })

  it('kategoriya va sahifalash', () => {
    expect(categoryPath('uz-Latn', 'kibersport')).toBe('/kibersport')
    expect(categoryPath('uz-Cyrl', 'kibersport')).toBe('/kr/kibersport')
    expect(categoryPath('uz-Latn', 'kibersport', 1)).toBe('/kibersport')
    expect(categoryPath('uz-Latn', 'kibersport', 2)).toBe('/kibersport/page/2')
    expect(categoryPath('uz-Cyrl', 'kibersport', 3)).toBe('/kr/kibersport/page/3')
  })

  it('post: slug ikkala yozuvda bir xil (lotin)', () => {
    expect(postPath('uz-Latn', 'gadjetlar', 'iphone-18')).toBe('/gadjetlar/iphone-18')
    expect(postPath('uz-Cyrl', 'gadjetlar', 'iphone-18')).toBe('/kr/gadjetlar/iphone-18')
  })

  it('teg va statik sahifa', () => {
    expect(tagPath('uz-Cyrl', 'cs2')).toBe('/kr/tag/cs2')
    expect(pagePath('uz-Latn', 'aloqa')).toBe('/aloqa')
  })

  it('localizePath: ichki yo‘l prefikslanadi, tashqi URL — yo‘q', () => {
    expect(localizePath('uz-Cyrl', '/texnologiyalar/yangi')).toBe('/kr/texnologiyalar/yangi')
    expect(localizePath('uz-Cyrl', '/')).toBe('/kr')
    expect(localizePath('uz-Latn', '/a/b')).toBe('/a/b')
    expect(localizePath('uz-Cyrl', 'https://example.com/x')).toBe('https://example.com/x')
    expect(localizePath('uz-Cyrl', '//evil.example')).toBe('//evil.example')
  })
})

describe('yozuvni yo‘ldan aniqlash', () => {
  it.each([
    ['/', 'uz-Latn'],
    ['/kibersport', 'uz-Latn'],
    ['/kr', 'uz-Cyrl'],
    ['/kr/kibersport/x', 'uz-Cyrl'],
    // `kr` bilan boshlanadigan, lekin boshqa segment
    ['/krasnoyarsk', 'uz-Latn'],
  ] as const)('%s → %s', (path, locale) => {
    expect(localeFromPathname(path)).toBe(locale)
  })

  it('stripLocalePrefix', () => {
    expect(stripLocalePrefix('/kr')).toBe('/')
    expect(stripLocalePrefix('/kr/a/b')).toBe('/a/b')
    expect(stripLocalePrefix('/a/b')).toBe('/a/b')
  })
})

describe('almashtirgich: boshqa yozuvdagi URL (TZ §3.6)', () => {
  it.each([
    ['/', { 'uz-Latn': '/', 'uz-Cyrl': '/kr' }],
    ['/kr', { 'uz-Latn': '/', 'uz-Cyrl': '/kr' }],
    ['/kibersport', { 'uz-Latn': '/kibersport', 'uz-Cyrl': '/kr/kibersport' }],
    [
      '/kr/kibersport/page/2',
      { 'uz-Latn': '/kibersport/page/2', 'uz-Cyrl': '/kr/kibersport/page/2' },
    ],
    [
      '/gadjetlar/iphone-18?ref=tg#izohlar',
      {
        'uz-Latn': '/gadjetlar/iphone-18?ref=tg#izohlar',
        'uz-Cyrl': '/kr/gadjetlar/iphone-18?ref=tg#izohlar',
      },
    ],
  ] as const)('%s', (path, expected) => {
    expect(alternatePaths(path)).toEqual(expected)
  })
})

describe('/page/{n} parametri', () => {
  it.each([
    ['2', 2],
    ['15', 15],
    ['1', 1],
    ['0', null],
    ['01', null],
    ['-1', null],
    ['2.5', null],
    ['abc', null],
    ['9999999', null],
  ] as const)('%s → %s', (value, expected) => {
    expect(parsePageParam(value)).toBe(expected)
  })
})
