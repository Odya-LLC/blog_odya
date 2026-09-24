import { expect, test } from '@playwright/test'

import { SEED_AUTHOR, SEED_POSTS, SEED_TAGS } from '../src/seed/data'

/**
 * M1-07 smoke: teg, muallif, statik sahifa, qidiruv — ikkala yozuvda (`pnpm seed` demo kontenti).
 */
const aiPost = SEED_POSTS.find((post) => post.tags.includes('chatgpt'))!
const chatgpt = SEED_TAGS.find((tag) => tag.slug === 'chatgpt')!

const SCRIPTS = [
  { locale: 'uz-Latn', prefix: '' },
  { locale: 'uz-Cyrl', prefix: '/kr' },
] as const

for (const script of SCRIPTS) {
  test.describe(script.locale, () => {
    test('teg sahifasi: postlar, < 3 post — noindex', async ({ page }) => {
      const response = await page.goto(`${script.prefix}/tag/${chatgpt.slug}`)
      expect(response?.status()).toBe(200)
      await expect(page.locator('html')).toHaveAttribute('lang', script.locale)
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        chatgpt.name[script.locale],
      )
      await expect(
        page.getByTestId('tag-posts').getByRole('link', { name: aiPost.title[script.locale] }),
      ).toBeVisible()
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    })

    test('muallif sahifasi: profil va maqolalar', async ({ page }) => {
      const response = await page.goto(`${script.prefix}/author/${SEED_AUTHOR.slug}`)
      expect(response?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        SEED_AUTHOR.name[script.locale],
      )
      await expect(page.getByTestId('author-posts').getByRole('listitem')).toHaveCount(
        SEED_POSTS.length,
      )
      const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents()
      expect(jsonLd.join('\n')).toContain('"@type":"Person"')
    })

    test('statik sahifa va footer havolasi', async ({ page }) => {
      await page.goto(`${script.prefix}/`)
      await page
        .locator('footer')
        .locator(`a[href="${script.prefix}/biz-haqimizda"]`)
        .first()
        .click()
      await expect(page).toHaveURL(`${script.prefix}/biz-haqimizda`)
      await expect(page.getByTestId('static-page').getByRole('heading', { level: 1 })).toBeVisible()
    })

    test('qidiruv: lotin va kirill so‘rov, oʻ/o‘ variantlari, noindex', async ({ page }) => {
      for (const query of ['sunʼiy intellekt', "sun'iy intellekt", 'сунъий интеллект']) {
        await page.goto(`${script.prefix}/search?q=${encodeURIComponent(query)}`)
        await expect(
          page
            .getByTestId('search-results')
            .getByRole('link', { name: aiPost.title[script.locale] }),
        ).toBeVisible()
      }
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
      // Forma (JS'siz GET) — natija yo'q holati.
      const input = page.getByRole('main').getByRole('searchbox')
      await input.fill('qwrtplkzx')
      await input.press('Enter')
      await expect(page).toHaveURL(new RegExp(`${script.prefix}/search\\?q=qwrtplkzx$`))
      await expect(page.getByTestId('search-results')).toHaveCount(0)
    })
  })
}

test.describe('header menyulari (kutubxonasiz: <dialog> va disclosure)', () => {
  test('"Yana" menyusi: ochiladi, Esc bilan yopiladi, fokus tugmaga qaytadi', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    const more = page.getByRole('button', { name: 'Yana' })
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    const link = page.locator('header').getByRole('link', { name: 'Ilm-fan' })
    await expect(link).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(link).toBeHidden()
    await expect(more).toBeFocused()
    await more.click()
    await link.click()
    await expect(page).toHaveURL('/ilm-fan')
    await expect(link).toBeHidden()
  })

  test('mobil menyu: modal ochiladi, havola bosilganda yopiladi', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/kr')
    await page.getByRole('button', { name: 'Менюни очиш' }).click()
    const dialog = page.getByRole('dialog', { name: 'Меню' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Менюни ёпиш' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: 'Менюни очиш' }).click()
    await dialog.getByRole('link', { name: 'Киберспорт', exact: true }).click()
    await expect(page).toHaveURL('/kr/kibersport')
    await expect(dialog).toBeHidden()
  })
})

test('/tag/…/page/1 → kanonik teg URL; band slug — 404', async ({ page }) => {
  await page.goto(`/kr/tag/${chatgpt.slug}/page/1`)
  await expect(page).toHaveURL(`/kr/tag/${chatgpt.slug}`)
  expect((await page.goto('/tag'))?.status()).toBe(404)
})
