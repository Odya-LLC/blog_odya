import { readFileSync } from 'node:fs'
import path from 'node:path'

import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { ROUTE_RESERVED_SLUGS, validateRouteSlug } from '@/lib/slug'
import { GONE_ROOT_SEGMENTS, isGone } from '@/site/gone'
import { proxy } from '@/proxy'

/**
 * OBLOG-50: WordPress buzilganidan qolgan URL'lar → 410, haqiqiy sahifalar → avvalgidek.
 * `gsc-indexed-sample.csv` — GSC "indekslangan" eksportidan (OBLOG-49) shakl bo'yicha tanlanma.
 */
const GSC_SAMPLE = readFileSync(
  path.join(import.meta.dirname, '__fixtures__/gsc-indexed-sample.csv'),
  'utf8',
)
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => {
    const comma = line.lastIndexOf(',')
    return { url: line.slice(0, comma), expected: line.slice(comma + 1) }
  })

/** WordPress izlari va spam shakllari → 410. */
const GONE = [
  // WordPress
  '/wp-admin',
  '/wp-admin/',
  '/wp-admin/install.php',
  '/wp-content/uploads/2019/05/photo.jpg',
  '/wp-content/plugins/x/shell.php',
  '/wp-includes/js/jquery.js',
  '/wp-json/wp/v2/users',
  '/wp-login.php',
  '/xmlrpc.php',
  '/index.php',
  '/index.php/foo/bar',
  '/feed',
  '/feed/',
  '/feed/atom',
  '/comments/feed',
  '/comments/feed/',
  '/?feed=rss2',
  '/?p=12345',
  '/?page_id=2',
  '/?cat=5',
  '/?author=1',
  '/?s=viagra',
  '/page/2',
  '/page/2/',
  '/kr/page/3',
  '/2019/05/eski-maqola/',
  '/2019/05',
  '/2021/11/12/eski/',
  '/tag/eski-teg/feed',
  '/author/admin/feed/',
  '/kr/tag/eski/feed',
  '/tag/%D1%82%D0%B5%D0%B3', // kirill slug (WP) — bizning format emas
  '/author/John_Doe',
  // Kengaytmalar
  '/cheap-viagra.html',
  '/jp/abc123.html',
  '/jp/abc.htm',
  '/default.asp',
  '/login.aspx',
  '/cgi-bin/test.cgi',
  '/index.jsp',
  '/script.pl',
  '/kibersport/eski.html',
  '/kr/foo.php',
  // Spam (GSC)
  '/products/12345/',
  '/products',
  '/listing/198095525',
  '/shop',
  '/shop/products/20014044/',
  '/shop/storeSearch/KeepCriteriaInput',
  '/clientlog',
  '/clientlog?feisbot=1&bot_check',
  '/Products/1/', // katta harf
  'http://localhost//wp-admin//', // takroriy slash
  // Bosh sahifa: begona parametrlar
  '/?xxx=1',
  '/?foo',
  '/?utm_source=x&casino=1',
  '/kr?p=1',
  '/kr/?p=1',
  '/?q=test', // bizning qidiruv — /search?q=
  '/?page=2',
]

/** Haqiqiy sahifalar va tizim yo'llari — proxy ularni o'tkazib yuboradi. */
const KEEP = [
  '/',
  '/kr',
  '/kibersport',
  '/kibersport/page/2',
  '/kibersport/page/1',
  '/kibersport/major-final',
  '/kr/kibersport/major-final',
  '/kr/kibersport',
  '/aloqa',
  '/bot',
  '/kr/bot',
  '/tag/cs2',
  '/tag/cs2/page/2',
  '/kr/tag/cs2',
  '/author/tahririyat',
  '/author/tahririyat/page/2',
  '/search',
  '/search?q=ai',
  '/search?q=ai&page=2',
  '/kr/search?q=ai',
  '/styleguide',
  '/admin',
  '/admin/collections/posts',
  '/admin/login',
  '/api/posts',
  '/api/mcp',
  '/api/graphql',
  '/api/media/file/photo.php', // Payload API — o'tkazib yuboriladi
  '/robots.txt',
  '/sitemap.xml',
  '/sitemaps/posts-2026-09.xml',
  '/news-sitemap.xml',
  '/rss.xml',
  '/kr/rss.xml',
  '/kibersport/rss.xml',
  '/feeds/latn',
  '/og/latn/post/major-final',
  '/og/cyrl/category/kibersport',
  '/brand/icon-512.png',
  '/styleguide/cover-ai.svg',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/_next/static/chunks/main.js',
  '/_next/image?url=x',
  '/.well-known/security.txt',
  // Bosh sahifa: ruxsat etilgan parametrlar
  '/?utm_source=telegram&utm_medium=channel&utm_campaign=latn',
  '/kr?utm_source=telegram&utm_medium=channel&utm_campaign=cyrl',
  '/?gclid=abc',
  '/?fbclid=abc',
  '/?yclid=1',
  '/?ysclid=1',
  '/?ref=producthunt',
  '/?_rsc=1abcd',
  '/kr?_rsc=1abcd',
  '/?__vercel_draft=1',
  '/?_vercel_share=abc',
  '/?preview=true&token=x',
  // Maqola/kategoriya — har qanday query (canonical hal qiladi)
  '/kibersport/major-final?utm_source=telegram&utm_medium=channel',
  '/kibersport?p=1',
  // Eski WP maqolalari (ildiz slug) va `/category/*` — egasi qarori (301 yoki 404)
  '/veb-sayt-sinovini-avtomatlashtirish-vositasini-qanday-tanlash-mumkin/',
  '/category/maqolalar/python/',
  // Sana bo'lmagan raqamli segmentlar
  '/2019',
  '/kibersport/2019/05',
]

describe('isGone (OBLOG-50)', () => {
  it.each(GONE)('410: %s', (url) => {
    expect(isGone(url)).toBe(true)
  })

  it.each(KEEP)('o‘tadi: %s', (url) => {
    expect(isGone(url)).toBe(false)
  })

  it.each(GSC_SAMPLE)('GSC tanlanmasi: $url → $expected', ({ url, expected }) => {
    expect(isGone(new URL(url))).toBe(expected === '410')
  })

  it('GSC tanlanmasi — barcha shakllar bor', () => {
    expect(GSC_SAMPLE.filter((row) => row.expected === '410').length).toBeGreaterThanOrEqual(25)
    expect(GSC_SAMPLE.filter((row) => row.expected === 'keep')).toHaveLength(4)
  })

  it('410 ildiz segmentlari — band slug (kategoriya/sahifa yaratib bo‘lmaydi)', () => {
    for (const segment of GONE_ROOT_SEGMENTS) {
      expect(ROUTE_RESERVED_SLUGS as readonly string[]).toContain(segment)
      expect(validateRouteSlug(segment)).not.toBe(true)
    }
  })
})

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), init)
}

describe('proxy (OBLOG-50)', () => {
  it('spam → 410 bitta qadamda (trailing slash redirect’siz)', async () => {
    const response = proxy(request('/products/12345/'))
    expect(response.status).toBe(410)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(response.headers.get('cache-control')).toContain('s-maxage=')
    const html = await response.text()
    expect(html).toContain('<html lang="uz">')
    expect(html).toContain('href="/"')
  })

  it('HEAD → 410 tanasiz', async () => {
    const response = proxy(request('/wp-login.php', { method: 'HEAD' }))
    expect(response.status).toBe(410)
    expect(await response.text()).toBe('')
  })

  it.each([
    ['/kibersport/', '/kibersport'],
    ['/kr/', '/kr'],
    ['/kibersport/major-final/?utm_source=telegram', '/kibersport/major-final?utm_source=telegram'],
    ['/tag/cs2//', '/tag/cs2'],
    [
      '/veb-sayt-sinovini-avtomatlashtirish-vositasini-qanday-tanlash-mumkin/',
      '/veb-sayt-sinovini-avtomatlashtirish-vositasini-qanday-tanlash-mumkin',
    ],
  ])('trailing slash: %s → 308 %s', (from, to) => {
    const response = proxy(request(from))
    expect(response.status).toBe(308)
    const location = new URL(response.headers.get('location')!)
    expect(location.origin).toBe('http://localhost:3000')
    expect(`${location.pathname}${location.search}`).toBe(to)
  })

  it('`//evil.com/` — ochiq redirect emas (host saqlanadi)', () => {
    const response = proxy(request('http://localhost:3000//evil.com/'))
    expect(response.status).toBe(308)
    expect(new URL(response.headers.get('location')!).host).toBe('localhost:3000')
  })

  it.each(['/', '/kr', '/kibersport/major-final', '/?_rsc=abc', '/search?q=ai'])(
    'haqiqiy sahifa → o‘tkazib yuboriladi: %s',
    (url) => {
      const response = proxy(request(url, { headers: { RSC: '1' } }))
      expect(response.status).toBe(200)
      expect(response.headers.get('x-middleware-next')).toBe('1')
    },
  )
})
