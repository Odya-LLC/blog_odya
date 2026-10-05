import { expect, test } from '@playwright/test'

import { SEED_POSTS } from '../src/seed/data'

/**
 * OBLOG-69: ko'rishlar mayog'i va "Ko'p o'qilgan" bloki. Oldindan: `pnpm seed && pnpm build` —
 * seed demo postlarga so'nggi 7 kunlik demo ko'rishlarni yozadi (`seedDemoViews`), shuning uchun
 * bosh sahifada blok bor. Maqolada joriy post chiqariladi: 3 ta demo postda qolgan 2 tasi
 * minimumdan (3) kam — blok yo'q; ko'proq ko'rilgan post bo'lsa (lokal DB) — joriy post ichida emas.
 */
const esports = SEED_POSTS.find((post) => post.category === 'kibersport')!

for (const prefix of ['', '/kr'] as const) {
  test(`${prefix || '/'}: bosh sahifada "Ko‘p o‘qilgan" — raqamlangan, maqolalarga havola`, async ({
    page,
  }) => {
    await page.goto(prefix || '/')
    const block = page.getByTestId('popular-posts')
    await expect(block).toBeVisible()
    await expect(block.getByRole('heading', { level: 2 })).toHaveText(
      prefix ? 'Кўп ўқилган' : 'Koʻp oʻqilgan',
    )
    const items = block.locator('ol > li')
    const count = await items.count()
    expect(count).toBeGreaterThanOrEqual(3)
    expect(count).toBeLessThanOrEqual(5)
    const href = await items
      .first()
      .getByRole('heading', { level: 3 })
      .getByRole('link')
      .getAttribute('href')
    expect(href).toMatch(prefix ? /^\/kr\/[^/]+\/[^/]+$/ : /^\/[^/]+\/[^/]+$/)
    await items.first().getByRole('heading', { level: 3 }).getByRole('link').click()
    await expect(page).toHaveURL(href!)
    await expect(page.getByTestId('article')).toBeVisible()
  })
}

test('maqola: ~5 s ko‘ringach /api/views ga post ID yuboriladi (bir marta), javob 204', async ({
  page,
}) => {
  const beacons: Array<{ at: number; body: string | null }> = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/views') {
      beacons.push({ at: Date.now(), body: request.postData() })
    }
  })
  const start = Date.now()
  await page.goto(`/kr/kibersport/${esports.slug}`)
  const article = page.getByTestId('article')
  const postId = await article.getAttribute('data-pv')
  expect(postId).toMatch(/^\d+$/)

  const response = await page.waitForResponse(
    (res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/views',
    { timeout: 15_000 },
  )
  expect(response.status()).toBe(204)
  expect(response.headers()['cache-control']).toBe('no-store')
  expect(beacons).toHaveLength(1)
  expect(beacons[0]!.body).toBe(postId)
  expect(beacons[0]!.at - start).toBeGreaterThanOrEqual(4_500)

  // Joriy post "Ko'p o'qilgan" ichida emas (blok bo'lsa).
  const block = page.getByTestId('popular-posts')
  if (await block.count()) {
    await expect(block.locator(`a[href$="/${esports.slug}"]`)).toHaveCount(0)
  }

  // Bir yuklanishda bir marta.
  await page.waitForTimeout(2_000)
  expect(beacons).toHaveLength(1)
})

test('maqola bo‘lmagan sahifa (kategoriya) — mayoq va GET yuborilmaydi', async ({ page }) => {
  let sent = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/views') sent++
  })
  await page.goto('/kibersport')
  await page.waitForTimeout(6_500)
  expect(sent).toBe(0)
})

test('/api/views: bot hisoblanmaydi; ID’siz GET — 400 (OBLOG-72)', async ({ request }) => {
  const bot = await request.post('/api/views', {
    data: '1',
    headers: { 'user-agent': 'Googlebot/2.1', 'content-type': 'text/plain' },
  })
  expect(bot.status()).toBe(204)
  expect(bot.headers()['set-cookie']).toBeUndefined()
  const get = await request.get('/api/views')
  expect(get.status()).toBe(400)
})
