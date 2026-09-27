import { expect, test } from '@playwright/test'

import { SEED_POSTS } from '../src/seed/data'

/**
 * OBLOG-50: WordPress buzilganidan qolgan URL'lar → 410 (bitta qadamda, 308'siz), haqiqiy
 * sahifalar — avvalgidek. Haqiqiy status kodlari `next start` (proxy + `redirects`) bilan.
 * Oldindan: `pnpm seed && pnpm build`.
 */
const esports = SEED_POSTS.find((post) => post.category === 'kibersport')!
const article = `/kibersport/${esports.slug}`

const GONE = [
  '/products/12345/',
  '/listing/198095525/',
  '/shop/products/20014044/',
  '/shop/storeSearch/KeepCriteriaInput',
  '/clientlog?feisbot=1&bot_check',
  '/wp-login.php',
  '/wp-admin/',
  '/wp-content/plugins/x/y.php',
  '/xmlrpc.php',
  '/feed/',
  '/cheap-viagra.html',
  '/jp/abc123.html',
  '/2019/05/eski/',
  '/page/2/',
  '/?p=12345',
  '/?s=casino',
  '/?xxx=spam',
  '/kr?page_id=2',
]

const OK = [
  '/',
  '/kr',
  '/kibersport',
  '/kr/kibersport',
  article,
  `/kr${article}`,
  `${article}?utm_source=telegram&utm_medium=channel&utm_campaign=latn`,
  '/?utm_source=telegram&utm_medium=channel&utm_campaign=latn',
  '/?gclid=abc&fbclid=def',
  '/tag/cs2',
  '/author/tahririyat',
  '/search?q=ai',
  '/bot',
  '/robots.txt',
  '/sitemap.xml',
  '/news-sitemap.xml',
  '/rss.xml',
  '/kr/rss.xml',
  '/kibersport/rss.xml',
  `/og/latn/post/${esports.slug}`,
  '/brand/icon-512.png',
  '/admin/login',
]

test.describe('410 Gone (OBLOG-50)', () => {
  for (const path of GONE) {
    test(`410: ${path}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(410)
      expect(response.headers()['x-robots-tag']).toContain('noindex')
      expect(response.headers()['content-type']).toContain('text/html')
      expect(await response.text()).toContain('href="/"')
    })
  }

  for (const path of OK) {
    test(`200: ${path}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(200)
    })
  }

  for (const [from, to] of [
    ['/kibersport/', '/kibersport'],
    ['/kr/', '/kr'],
    [`${article}/?utm_source=telegram`, `${article}?utm_source=telegram`],
    ['/admin/', '/admin'],
    ['/api/posts/', '/api/posts'],
    // Eski WP maqolasi (egasi qarori): avvalgidek 308 → 404 (yoki `redirects` yozuvi bo'lsa 301).
    [
      '/veb-sayt-sinovini-avtomatlashtirish-vositasini-qanday-tanlash-mumkin/',
      '/veb-sayt-sinovini-avtomatlashtirish-vositasini-qanday-tanlash-mumkin',
    ],
  ] as const) {
    test(`308: ${from} → ${to}`, async ({ request }) => {
      const response = await request.get(from, { maxRedirects: 0 })
      expect(response.status()).toBe(308)
      expect(new URL(response.headers()['location']!, 'http://x').pathname).toBe(
        new URL(to, 'http://x').pathname,
      )
      expect(response.headers()['location']).toContain(to)
    })
  }

  test('404 avvalgidek: mavjud bo‘lmagan sahifa va /category/*', async ({ request }) => {
    for (const path of ['/bunday-sahifa-yoq', '/category/maqolalar/python']) {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status(), path).toBe(404)
    }
  })

  test('RSC so‘rovlari (`_rsc`, client navigatsiya) buzilmaydi', async ({ request }) => {
    for (const path of ['/?_rsc=abc12', '/kr?_rsc=abc12', '/kibersport?_rsc=abc12']) {
      // Birinchi qadam — 410 emas (Next `_rsc` xeshini tekshirib, 307 bilan to'g'rilashi mumkin).
      const first = await request.get(path, { maxRedirects: 0, headers: { RSC: '1' } })
      expect(first.status(), path).not.toBe(410)
      const response = await request.get(path, { headers: { RSC: '1' } })
      expect(response.status(), path).toBe(200)
      expect(response.headers()['content-type'], path).toContain('text/x-component')
    }
  })

  test('client navigatsiya: UTM bilan bosh sahifa → kategoriya → bosh sahifa', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const home = await page.goto('/?utm_source=telegram&utm_medium=channel')
    expect(home?.status()).toBe(200)
    await page
      .getByRole('navigation', { name: /Kategoriyalar/ })
      .first()
      .getByRole('link', { name: 'Kibersport', exact: true })
      .click()
    await expect(page).toHaveURL('/kibersport')
    await page.goBack()
    await expect(page).toHaveURL(/\/\?utm_source=telegram/)
    expect(errors).toEqual([])
  })
})
