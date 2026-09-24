import { expect, type Page, test } from '@playwright/test'

import { SEED_POSTS } from '../src/seed/data'

/**
 * Smoke (M1-05 acceptance): demo postlar (`pnpm seed`) lotin va kirill URL'larida ochiladi,
 * almashtirgich boshqa yozuvdagi aynan shu sahifaga o'tadi, rasmlar custom loader bilan
 * (WebP variantlar, `/_next/image` yo'q).
 */
const esports = SEED_POSTS.find((post) => post.category === 'kibersport')!
const featured = SEED_POSTS.find((post) => post.isFeatured)!

const SCRIPTS = [
  {
    locale: 'uz-Latn',
    prefix: '',
    categoryName: 'Kibersport',
    other: { locale: 'uz-Cyrl', prefix: '/kr', label: 'Кирилл' },
  },
  {
    locale: 'uz-Cyrl',
    prefix: '/kr',
    categoryName: 'Киберспорт',
    other: { locale: 'uz-Latn', prefix: '', label: 'Lotin' },
  },
] as const

/** Sahifa davomida yuklangan rasm so'rovlari. */
function trackImages(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'image' || request.url().includes('/_next/image')) {
      urls.push(request.url())
    }
  })
  return urls
}

for (const script of SCRIPTS) {
  test.describe(`${script.locale}`, () => {
    test('bosh sahifa → kategoriya → maqola → almashtirgich', async ({ page, context }) => {
      const images = trackImages(page)
      const home = await page.goto(`${script.prefix}/`)
      expect(home?.status()).toBe(200)
      await expect(page.locator('html')).toHaveAttribute('lang', script.locale)
      await expect(
        page.getByRole('heading', { level: 2, name: featured.title[script.locale] }),
      ).toBeVisible()

      // Header menyusi → kategoriya.
      await page
        .getByRole('navigation', { name: /Kategoriyalar|Категориялар/ })
        .first()
        .getByRole('link', { name: script.categoryName, exact: true })
        .click()
      await expect(page).toHaveURL(`${script.prefix}/kibersport`)
      await expect(page.getByRole('heading', { level: 1, name: script.categoryName })).toBeVisible()

      // Kategoriya → maqola.
      await page
        .getByTestId('category-posts')
        .getByRole('link', { name: esports.title[script.locale] })
        .click()
      const articlePath = `${script.prefix}/kibersport/${esports.slug}`
      await expect(page).toHaveURL(articlePath)
      await expect(
        page.getByRole('heading', { level: 1, name: esports.title[script.locale] }),
      ).toBeVisible()
      await expect(
        page.getByTestId('article').getByRole('link', { name: esports.source.name }),
      ).toHaveAttribute('href', esports.source.url)

      // Almashtirgich → shu maqolaning boshqa yozuvdagi URL'i, tanlov cookie'da.
      await page.getByRole('link', { name: script.other.label, exact: true }).click()
      await expect(page).toHaveURL(`${script.other.prefix}/kibersport/${esports.slug}`)
      await expect(page.locator('html')).toHaveAttribute('lang', script.other.locale)
      await expect(
        page.getByRole('heading', { level: 1, name: esports.title[script.other.locale] }),
      ).toBeVisible()
      const cookies = await context.cookies()
      expect(cookies.find((cookie) => cookie.name === 'script')?.value).toBe(script.other.locale)

      expect(images.filter((url) => url.includes('/_next/image'))).toEqual([])
    })

    test('maqola: Lexical bloklari, SourceBox, AI izohi, rasmlar WebP', async ({ page }) => {
      const images = trackImages(page)
      await page.goto(`${script.prefix}/${featured.category}/${featured.slug}`)
      const article = page.getByTestId('article')
      await expect(article.getByRole('heading', { level: 1 })).toHaveText(
        featured.title[script.locale],
      )
      await expect(article.locator('table th').first()).toBeVisible()
      await expect(article.locator('pre code')).toContainText('curl')
      await expect(article.locator('blockquote')).toBeVisible()
      await expect(
        article.locator('iframe[src^="https://www.youtube-nocookie.com/embed/"]'),
      ).toHaveCount(1)
      await expect(article.getByRole('complementary')).toContainText(featured.source.name)
      // AI shaffoflik izohi (rewrittenBy: ai_agent → aiDisclosure).
      await expect(article.getByRole('complementary')).toContainText(
        /sunʼiy intellekt|сунъий интеллект/i,
      )

      const cover = article.locator('img').first()
      await expect(cover).toBeVisible()
      await expect
        .poll(() => cover.evaluate((img: HTMLImageElement) => img.currentSrc))
        .toMatch(/\.webp$/)
      await page.waitForLoadState('networkidle')
      expect(images.filter((url) => url.includes('/_next/image'))).toEqual([])
      const media = images.filter((url) => url.includes('namuna-muqova'))
      expect(media.length).toBeGreaterThan(0)
      for (const url of media) expect(url).toMatch(/\.webp($|\?)/)
    })

    test('/bot — OdyaBlogBot haqida (User-Agent havolasi)', async ({ page }) => {
      const response = await page.goto(`${script.prefix}/bot`)
      expect(response?.status()).toBe(200)
      await expect(page.locator('html')).toHaveAttribute('lang', script.locale)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        script.locale === 'uz-Latn' ? 'OdyaBlogBot haqida' : 'OdyaBlogBot ҳақида',
      )
      await expect(page.getByText('OdyaBlogBot/1.0 (+https://blog.odya.uz/bot)')).toBeVisible()
      await expect(page.locator('a[href^="mailto:"]')).toBeVisible()
    })

    test('404 joriy yozuvda', async ({ page }) => {
      const response = await page.goto(`${script.prefix}/bunday-sahifa-yoq`)
      expect(response?.status()).toBe(404)
      await expect(page.locator('html')).toHaveAttribute('lang', script.locale)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        script.locale === 'uz-Latn' ? 'Sahifa topilmadi' : 'Саҳифа топилмади',
      )
    })
  })
}

test('/…/page/1 → kanonik kategoriya URL; mavjud bo‘lmagan sahifa — 404', async ({ page }) => {
  await page.goto('/kr/kibersport/page/1')
  await expect(page).toHaveURL('/kr/kibersport')
  const missing = await page.goto('/kibersport/page/99')
  expect(missing?.status()).toBe(404)
})
