import { expect, test } from '@playwright/test'

import { SEED_POSTS } from '../src/seed/data'

/**
 * SEO smoke (M1-06): maqola `<head>` (canonical, hreflang, OG, JSON-LD), robots.txt, sitemap,
 * news sitemap, RSS va OG rasm — lotin va kirill. Oldindan: `pnpm seed && pnpm build`.
 */
const esports = SEED_POSTS.find((post) => post.category === 'kibersport')!

/** To'liq URL `path` bilan tugaydi (origin — `NEXT_PUBLIC_SITE_URL`, test porti emas). */
function endsWith(path: string): RegExp {
  // Yo'llar faqat slug belgilaridan ([a-z0-9-/]) — qochirish shart emas.
  return new RegExp(`^https?://[^/]+${path}$`)
}

for (const script of [
  { locale: 'uz-Latn', prefix: '', og: 'latn', brand: 'Blog Odya' },
  { locale: 'uz-Cyrl', prefix: '/kr', og: 'cyrl', brand: 'Блог Одя' },
] as const) {
  test(`${script.locale}: maqola metadata va JSON-LD`, async ({ page }) => {
    const path = `${script.prefix}/kibersport/${esports.slug}`
    await page.goto(path)
    const head = page.locator('head')
    await expect(page).toHaveTitle(`${esports.title[script.locale]} — ${script.brand}`)
    await expect(head.locator('link[rel="canonical"]')).toHaveAttribute('href', endsWith(path))
    await expect(head.locator('link[hreflang="uz-Latn"]')).toHaveAttribute(
      'href',
      endsWith(`/kibersport/${esports.slug}`),
    )
    await expect(head.locator('link[hreflang="uz-Cyrl"]')).toHaveAttribute(
      'href',
      endsWith(`/kr/kibersport/${esports.slug}`),
    )
    await expect(head.locator('link[hreflang="x-default"]')).toHaveAttribute(
      'href',
      endsWith(`/kibersport/${esports.slug}`),
    )
    await expect(head.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'uz_UZ')
    await expect(head.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article')
    await expect(head.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    )

    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? '{}')))
    const article = jsonLd.find((item) => item['@type'] === 'NewsArticle')
    expect(article).toMatchObject({
      headline: esports.title[script.locale],
      inLanguage: script.locale,
      isBasedOn: esports.source.url,
      url: expect.stringMatching(endsWith(path)),
    })
    expect(jsonLd.some((item) => item['@type'] === 'BreadcrumbList')).toBe(true)
  })

  test(`${script.locale}: RSS va OG rasm`, async ({ request }) => {
    const rss = await request.get(`${script.prefix}/rss.xml`)
    expect(rss.status()).toBe(200)
    expect(rss.headers()['content-type']).toContain('application/rss+xml')
    expect(await rss.text()).toContain(`${script.prefix}/kibersport/${esports.slug}`)

    const category = await request.get(`${script.prefix}/kibersport/rss.xml`)
    expect(category.status()).toBe(200)

    const og = await request.get(`/og/${script.og}/post/${esports.slug}`)
    expect(og.status()).toBe(200)
    expect(og.headers()['content-type']).toBe('image/png')
  })
}

test('robots.txt, sitemap index, oylik sitemap va news sitemap', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text()
  for (const rule of [
    'Disallow: /admin',
    'Disallow: /api',
    'Disallow: /search',
    'Disallow: /kr/search',
  ]) {
    expect(robots).toContain(rule)
  }
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/)

  const index = await request.get('/sitemap.xml')
  expect(index.status()).toBe(200)
  const indexXml = await index.text()
  const month = /\/sitemaps\/(posts-\d{4}-\d{2}\.xml)/.exec(indexXml)?.[1]
  expect(month).toBeTruthy()

  const posts = await (await request.get(`/sitemaps/${month}`)).text()
  expect(posts).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
  expect(posts).toContain(`/kr/kibersport/${esports.slug}</loc>`)
  expect(posts).toContain('hreflang="x-default"')

  const news = await request.get('/news-sitemap.xml')
  expect(news.status()).toBe(200)
  expect(await news.text()).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"')
})
