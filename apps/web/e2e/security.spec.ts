import { expect, test } from '@playwright/test'

import { SEED_POSTS } from '../src/seed/data'

/**
 * OBLOG-23 (TZ §9.2, §9.4, §9.5): security headers, `/api/health`, CSP buzilishlari yo'qligi,
 * rozilikkacha analitika yo'qligi. `next start` (haqiqiy sarlavhalar). Oldindan: `pnpm seed && pnpm build`.
 */
const post = SEED_POSTS[0]!
const article = `/${post.category}/${post.slug}`

const ANALYTICS =
  /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|google\.[a-z.]+\/(g\/collect|ads)|mc\.yandex\./

test.describe('xavfsizlik va monitoring (OBLOG-23)', () => {
  for (const path of ['/', '/kr', article]) {
    test(`security headers: ${path}`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.status()).toBe(200)
      const headers = response.headers()
      expect(headers['strict-transport-security']).toContain('max-age=')
      expect(headers['x-content-type-options']).toBe('nosniff')
      expect(headers['x-frame-options']).toBe('DENY')
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
      expect(headers['permissions-policy']).toContain('camera=()')
      expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
      expect(headers['x-powered-by']).toBeUndefined()
    })
  }

  test('admin: o‘z CSP’si, SAMEORIGIN; login sahifasi CSP xatosiz', async ({ page }) => {
    const violations: string[] = []
    page.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) violations.push(message.text())
    })
    const response = await page.goto('/admin/login')
    expect(response?.headers()['x-frame-options']).toBe('SAMEORIGIN')
    expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'self'")
    await expect(page.locator('#field-email')).toBeVisible()
    expect(violations).toEqual([])
  })

  test('/api/health — 200, DB ok, keshsiz', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toContain('no-store')
    expect(await response.json()).toMatchObject({ status: 'ok', db: 'ok' })
    expect((await request.head('/api/health')).status()).toBe(200)
  })

  test('/api/health?sentry-test=1 — tokensiz 401 yoki 503 (sir sozlanmagan)', async ({
    request,
  }) => {
    const response = await request.get('/api/health?sentry-test=1')
    expect([401, 503]).toContain(response.status())
  })

  test('sayt: CSP xatolari yo‘q, rozilikkacha analitika so‘rovlari yo‘q', async ({ page }) => {
    const violations: string[] = []
    const analytics: string[] = []
    page.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) violations.push(message.text())
    })
    page.on('request', (request) => {
      if (ANALYTICS.test(request.url())) analytics.push(request.url())
    })
    for (const path of ['/', '/kr', article]) {
      await page.goto(path, { waitUntil: 'load' })
      await page.waitForTimeout(500)
    }
    expect(violations).toEqual([])
    expect(analytics).toEqual([])
  })
})
