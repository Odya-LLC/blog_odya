import { expect, test } from '@playwright/test'

import { SEED_AUTHOR, SEED_POSTS } from '../src/seed/data'

/**
 * M1-07: teg, muallif, statik sahifa, qidiruv va 404 — lotin va kirill. Oldindan: `pnpm seed &&
 * pnpm build` (demo postlar, huquqiy sahifalar, `tahririyat` muallifi).
 */
const esports = SEED_POSTS.find((post) => post.category === 'kibersport')!
const featured = SEED_POSTS.find((post) => post.isFeatured)!

const SCRIPTS = [
  {
    locale: 'uz-Latn',
    prefix: '',
    tagLabel: 'Teg',
    searchHeading: /qidiruv/i,
    // Lotin sayt, kirill so'rov (yozuv avtomatik aniqlanadi).
    crossQuery: 'сунъий интеллект',
    emptyTitle: 'Hech narsa topilmadi',
  },
  {
    locale: 'uz-Cyrl',
    prefix: '/kr',
    tagLabel: 'Тег',
    searchHeading: /қидирув/i,
    crossQuery: 'sunʼiy intellekt',
    emptyTitle: 'Ҳеч нарса топилмади',
  },
] as const

function noindex(content: string | null): boolean {
  return Boolean(content && /noindex/.test(content))
}

for (const script of SCRIPTS) {
  test.describe(`${script.locale}: qo‘shimcha sahifalar`, () => {
    test('teg sahifasi: postlar, < 3 post — noindex, maqolaga o‘tish', async ({ page }) => {
      const response = await page.goto(`${script.prefix}/tag/cs2`)
      expect(response?.status()).toBe(200)
      await expect(page.locator('html')).toHaveAttribute('lang', script.locale)
      await expect(page.getByRole('heading', { level: 1 })).toContainText('CS2')
      await expect(page.getByText(script.tagLabel, { exact: true })).toBeVisible()
      const robots = await page.locator('meta[name="robots"]').getAttribute('content')
      expect(noindex(robots)).toBe(true)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        new RegExp(`${script.prefix}/tag/cs2$`),
      )
      await page
        .getByTestId('tag-posts')
        .getByRole('link', { name: esports.title[script.locale] })
        .click()
      await expect(page).toHaveURL(`${script.prefix}/kibersport/${esports.slug}`)
    })

    test('maqoladagi teg havolasi → teg sahifasi', async ({ page }) => {
      await page.goto(`${script.prefix}/kibersport/${esports.slug}`)
      await page.getByRole('link', { name: /CS2/ }).first().click()
      await expect(page).toHaveURL(`${script.prefix}/tag/cs2`)
    })

    test('muallif sahifasi: profil, Person JSON-LD, maqolalar', async ({ page }) => {
      const response = await page.goto(`${script.prefix}/author/${SEED_AUTHOR.slug}`)
      expect(response?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        SEED_AUTHOR.name[script.locale],
      )
      await expect(page.getByText(SEED_AUTHOR.bio[script.locale])).toBeVisible()
      const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents()
      expect(jsonLd.some((text) => text.includes('"@type":"Person"'))).toBe(true)
      await expect(
        page.getByTestId('author-posts').getByRole('link', { name: featured.title[script.locale] }),
      ).toBeVisible()
    })

    test('statik sahifa (/aloqa) va footer menyusi', async ({ page }) => {
      const response = await page.goto(`${script.prefix}/aloqa`)
      expect(response?.status()).toBe(200)
      await expect(page.locator('html')).toHaveAttribute('lang', script.locale)
      const article = page.getByTestId('static-page')
      await expect(article.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        new RegExp(`${script.prefix}/aloqa$`),
      )
      // Footer (footer global) → boshqa huquqiy sahifa, joriy yozuvda.
      const footerLink = page
        .locator('footer')
        .locator(`a[href="${script.prefix}/tahririyat-siyosati"]`)
      await expect(footerLink).toHaveCount(1)
      await footerLink.click()
      await expect(page).toHaveURL(`${script.prefix}/tahririyat-siyosati`)
      await expect(page.getByTestId('static-page')).toBeVisible()
    })

    test('qidiruv: header formasi → natijalar, noindex; kirill/lotin so‘rov', async ({ page }) => {
      await page.goto(`${script.prefix}/`)
      // Desktop header'dagi qidiruv formasi (JS'siz GET forma).
      const form = page.locator('header form[role="search"]').first()
      await form.getByRole('searchbox').fill('namuna')
      await form.getByRole('searchbox').press('Enter')
      await expect(page).toHaveURL(new RegExp(`${script.prefix}/search\\?q=namuna$`))
      await expect(page.getByRole('heading', { level: 1 })).toContainText('namuna')
      const robots = await page.locator('meta[name="robots"]').getAttribute('content')
      expect(noindex(robots)).toBe(true)
      await expect(page.getByTestId('search-results').getByRole('listitem')).toHaveCount(
        SEED_POSTS.length,
      )

      // Boshqa yozuvdagi so'rov ham topadi (kalit — bitta), natija joriy yozuvda.
      await page.goto(`${script.prefix}/search?q=${encodeURIComponent(script.crossQuery)}`)
      await expect(
        page
          .getByTestId('search-results')
          .getByRole('link', { name: featured.title[script.locale] }),
      ).toBeVisible()

      // oʻ / o' variantlari: "oʻzbek" (U+02BB) va "o'zbek" (ASCII) bir xil natija.
      const counts: number[] = []
      for (const q of ['oʻzbek tilida', "o'zbek tilida"]) {
        await page.goto(`${script.prefix}/search?q=${encodeURIComponent(q)}`)
        counts.push(await page.getByTestId('search-results').getByRole('listitem').count())
      }
      expect(counts[0]).toBeGreaterThan(0)
      expect(counts[1]).toBe(counts[0])
    })

    test('qidiruv: natija yo‘q — bo‘sh holat; so‘rovsiz — faqat forma', async ({ page }) => {
      const response = await page.goto(`${script.prefix}/search?q=zzqqxxyyqq`)
      expect(response?.status()).toBe(200)
      await expect(page.getByText(script.emptyTitle)).toBeVisible()
      await page.goto(`${script.prefix}/search`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(script.searchHeading)
      await expect(page.getByText(script.emptyTitle)).toHaveCount(0)
    })

    test('404: teg/muallif/sahifa topilmasa', async ({ page }) => {
      for (const path of ['/tag/bunday-teg-yoq', '/author/bunday-muallif-yoq', '/bunday-yoq']) {
        const response = await page.goto(`${script.prefix}${path}`)
        expect(response?.status(), path).toBe(404)
        await expect(page.locator('html')).toHaveAttribute('lang', script.locale)
      }
    })
  })
}

test('/tag/{slug}/page/1 → kanonik teg URL', async ({ page }) => {
  await page.goto('/kr/tag/cs2/page/1')
  await expect(page).toHaveURL('/kr/tag/cs2')
})

test('header: "Yana" menyusi (disclosure) — ochiladi, Esc yopadi, havola ishlaydi', async ({
  page,
}) => {
  await page.goto('/')
  const more = page.getByRole('button', { name: 'Yana' })
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await more.click()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  const link = page.getByRole('banner').getByRole('link', { name: 'Ilm-fan', exact: true })
  await expect(link).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await expect(more).toBeFocused()
  await more.click()
  await link.click()
  await expect(page).toHaveURL('/ilm-fan')
})

test.describe('mobil', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('mobil menyu (<dialog>): ochiladi, Esc yopadi, havola bosilganda yopiladi', async ({
    page,
  }) => {
    await page.goto('/kr')
    await page.getByRole('button', { name: 'Менюни очиш' }).click()
    const dialog = page.getByRole('dialog', { name: 'Меню' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: 'Менюни очиш' }).click()
    await dialog.getByRole('link', { name: 'Киберспорт', exact: true }).click()
    await expect(page).toHaveURL('/kr/kibersport')
    await expect(dialog).toBeHidden()
  })
})
