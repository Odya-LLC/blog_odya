import { expect, type Page, test } from '@playwright/test'

import { SEED_POSTS } from '../src/seed/data'

/**
 * OBLOG-72: maqola meta qatoridagi ko'rishlar soni. Oldindan: `pnpm seed && pnpm build` — seed
 * demo postlarga so'nggi 7 kunlik ko'rishlarni yozadi (har biri ≥ 10), shuning uchun server
 * qiymati ko'rinadi. Yangi qiymat — brauzer skripti (`GET /api/views?id=`, `pageviews/beacon.ts`).
 */
const esports = SEED_POSTS.find((post) => post.category === 'kibersport')!
const latnPath = `/kibersport/${esports.slug}`
const cyrlPath = `/kr${latnPath}`

/** `GET /api/views?id=` javobini almashtirish (CDN keshidagi yangi qiymat). */
async function mockCount(page: Page, views: number) {
  await page.route(/\/api\/views\?id=\d+$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ views }),
    }),
  )
}

/** Maqola yuklangandan keyingi jami layout-shift (CLS). */
async function layoutShift(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number }>) {
            total += entry.value
          }
        }).observe({ type: 'layout-shift', buffered: true })
        setTimeout(() => resolve(total), 300)
      }),
  )
}

test('API: chop etilgan post — 200 {views}, CDN keshi; noto‘g‘ri / noma’lum — 400 / 404', async ({
  page,
  request,
}) => {
  await page.goto(latnPath)
  const postId = await page.getByTestId('article').getAttribute('data-pv')
  const ok = await request.get(`/api/views?id=${postId}`)
  expect(ok.status()).toBe(200)
  expect(ok.headers()['cache-control']).toBe('public, s-maxage=300, stale-while-revalidate=600')
  expect(ok.headers()['set-cookie']).toBeUndefined()
  const body = (await ok.json()) as { views: number }
  expect(body.views).toBeGreaterThanOrEqual(10)

  expect((await request.get('/api/views?id=abc')).status()).toBe(400)
  expect((await request.get('/api/views?id=2000000000')).status()).toBe(404)
})

for (const [path, label, unit] of [
  [latnPath, 'marta oʻqildi', 'ming'],
  [cyrlPath, 'марта ўқилди', 'минг'],
] as const) {
  test(`${path}: meta qatorida "N ${label}" — skript yangi qiymatni yozadi, CLS yo‘q`, async ({
    page,
  }) => {
    // Server (keshlangan) qiymati demo ko'rishlar; brauzer olgan yangisi — 1234.
    await mockCount(page, 1234)
    const counted = page.waitForResponse((res) => /\/api\/views\?id=\d+$/.test(res.url()))
    await page.goto(path)
    const views = page.getByTestId('article-views')
    await expect(views).toBeVisible()
    await expect(views).toContainText(label)
    const server = Number(await views.getAttribute('data-views'))
    expect(server).toBeGreaterThanOrEqual(10)
    await counted
    await expect(views).toHaveText(`1,2 ${unit} ${label}`)
    await expect(views).toHaveAttribute('data-views', '1234')
    // Faqat raqam o'zgaradi — joy oldindan band.
    expect(await layoutShift(page)).toBeLessThan(0.01)
  })
}

test('chegaradan kam (server ham, brauzer ham) — yashirin; oshsa — ochiladi', async ({ page }) => {
  // Server qiymatini "0, yashirin" ga almashtiramiz (yangi maqola holati).
  await page.route(latnPath, async (route) => {
    const response = await route.fetch()
    const html = (await response.text()).replace(
      /<p data-views="\d+" data-testid="article-views"/,
      '<p data-views="0" data-testid="article-views" hidden=""',
    )
    await route.fulfill({ response, body: html })
  })
  await mockCount(page, 3)
  const counted = page.waitForResponse((res) => /\/api\/views\?id=\d+$/.test(res.url()))
  await page.goto(latnPath)
  await counted
  await page.waitForTimeout(500)
  await expect(page.getByTestId('article-views')).toBeHidden()

  // Xuddi shu holat, lekin ko'rishlar chegaradan oshgan.
  await page.unroute(/\/api\/views\?id=\d+$/)
  await mockCount(page, 42)
  const again = page.waitForResponse((res) => /\/api\/views\?id=\d+$/.test(res.url()))
  await page.reload()
  await again
  await expect(page.getByTestId('article-views')).toHaveText('42 marta oʻqildi')
})
