import { type APIRequestContext, expect, type Page, test } from '@playwright/test'

import { SEED_POSTS } from '../src/seed/data'

/**
 * OBLOG-23 (TZ §9.2, §9.4, §9.5): security headers, `/api/health`, CSP buzilishlari yo'qligi.
 * OBLOG-60: cookie banner yo'q — GA4/Metrica ID'lar bo'lsa, analitika hech qanday harakatsiz
 * yuklanadi (OBLOG-111: `load` paytida emas — birinchi faollikda yoki 5 s dan keyin); ID'lar
 * bo'lmasa — hech narsa. `next start` (haqiqiy sarlavhalar).
 * Oldindan: `pnpm seed && pnpm build`.
 *
 * ID'lar bilan tekshiruv: `site-settings` da ID'lar bor bo'lsa — o'shalar bilan; bo'lmasa va
 * `E2E_EDITOR_EMAIL`/`E2E_EDITOR_PASSWORD` (admin) berilgan bo'lsa — test vaqtincha test ID'larini
 * yozadi va oxirida qaytaradi. Analitika domenlariga so'rovlar Playwright `route` bilan
 * to'xtatiladi (Google/Yandex'ga hech narsa ketmaydi).
 */
const post = SEED_POSTS[0]!
const article = `/${post.category}/${post.slug}`

const ANALYTICS =
  /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|google\.[a-z.]+\/(g\/collect|ads)|mc\.yandex\./

const EMAIL = process.env.E2E_EDITOR_EMAIL
const PASSWORD = process.env.E2E_EDITOR_PASSWORD
const TEST_IDS = { ga4MeasurementId: 'G-E2ETEST123', yandexMetrikaId: '12345678' }

type AnalyticsIds = { ga4MeasurementId: string | null; yandexMetrikaId: string | null }

async function readAnalyticsIds(request: APIRequestContext): Promise<AnalyticsIds> {
  const response = await request.get('/api/globals/site-settings?depth=0')
  expect(response.ok()).toBe(true)
  const { analytics } = (await response.json()) as { analytics?: Partial<AnalyticsIds> }
  return {
    ga4MeasurementId: analytics?.ga4MeasurementId || null,
    yandexMetrikaId: analytics?.yandexMetrikaId || null,
  }
}

async function writeAnalyticsIds(request: APIRequestContext, token: string, ids: AnalyticsIds) {
  const response = await request.post('/api/globals/site-settings', {
    headers: { Authorization: `JWT ${token}` },
    data: { analytics: ids },
  })
  expect(response.ok()).toBe(true)
}

/** Analitika so'rovlarini yozib, to'xtatadi (tashqi tarmoqqa chiqmaydi). */
async function captureAnalytics(page: Page): Promise<string[]> {
  const requests: string[] = []
  await page.route(ANALYTICS, (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  return requests
}

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

  test('sayt: CSP xatolari yo‘q, cookie banner yo‘q', async ({ page, context }) => {
    const violations: string[] = []
    page.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) violations.push(message.text())
    })
    await captureAnalytics(page)
    for (const path of ['/', '/kr', article]) {
      await page.goto(path, { waitUntil: 'load' })
      await page.waitForTimeout(500)
      await expect(page.locator('#cookie-banner, [data-consent-value]')).toHaveCount(0)
      expect(await page.locator('html').getAttribute('data-consent')).toBeNull()
    }
    expect(violations).toEqual([])
    expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain('cookie_consent')
  })

  test('analitika: ID’lar bo‘lsa — harakatsiz yuklanadi, bo‘lmasa — hech narsa', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000)
    const original = await readAnalyticsIds(request)
    let ids = original
    let token: string | null = null
    if (!original.ga4MeasurementId && !original.yandexMetrikaId && EMAIL && PASSWORD) {
      const login = await request.post('/api/users/login', {
        data: { email: EMAIL, password: PASSWORD },
      })
      expect(login.ok()).toBe(true)
      token = ((await login.json()) as { token: string }).token
      await writeAnalyticsIds(request, token, TEST_IDS)
      ids = TEST_IDS
    }
    try {
      const requests = await captureAnalytics(page)
      const configured = Boolean(ids.ga4MeasurementId || ids.yandexMetrikaId)
      for (const [index, path] of ['/', '/kr', article].entries()) {
        requests.length = 0
        await page.goto(path, { waitUntil: 'load' })
        // OBLOG-111: sahifa yuklanishi paytida (Lighthouse oynasi) analitika hali yo'q.
        await page.waitForTimeout(1000)
        expect(requests).toEqual([])
        if (!configured) continue
        // Rozilik yo'q. Birinchi sahifa — faolliksiz, fallback (5 s) dan keyin o'zi;
        // qolganlari — birinchi faollikda (scroll).
        if (index > 0) await page.mouse.wheel(0, 200)
        const timeout = index === 0 ? 15_000 : 5_000
        if (ids.ga4MeasurementId) {
          await expect
            .poll(
              () => requests.some((url) => url.includes(`gtag/js?id=${ids.ga4MeasurementId}`)),
              { timeout },
            )
            .toBe(true)
        }
        if (ids.yandexMetrikaId) {
          await expect
            .poll(() => requests.some((url) => url.includes('/metrika/tag.js')), { timeout })
            .toBe(true)
        }
        const contentGroup = path === '/kr' ? 'cyrl' : 'latn'
        if (ids.ga4MeasurementId) {
          const config = await page.evaluate(() =>
            ((window as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
              .map((entry) => Array.from(entry))
              .find((entry) => entry[0] === 'config'),
          )
          expect(config?.[2]).toEqual({ content_group: contentGroup })
        }
        // Bitta yuklash — ikki marta init yo'q.
        const scripts = await page.evaluate(
          () =>
            document.querySelectorAll(
              'script[src*="googletagmanager.com/gtag/js"], script[src*="mc.yandex.ru/metrika"]',
            ).length,
        )
        expect(scripts).toBe(
          Number(Boolean(ids.ga4MeasurementId)) + Number(Boolean(ids.yandexMetrikaId)),
        )
      }
    } finally {
      if (token) await writeAnalyticsIds(request, token, original)
    }
  })
})
