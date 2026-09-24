import { expect, type Page, test } from '@playwright/test'

/**
 * Tahririyat navbati (M2-04) — admin oqimi: login → navbat → rad etish → qoralamaga olish →
 * qo'lda yozish → in_progress → review → publish; dashboard va review ro'yxati.
 *
 * Tayyorlash (lokal; CI'da `E2E_EDITOR_*` bo'lmasa test o'tkazib yuboriladi):
 *
 *   E2E_EDITOR_EMAIL=… E2E_EDITOR_PASSWORD=… \
 *     pnpm --filter @blog-odya/web payload run src/seed/editorial-fixtures.ts
 *   E2E_PORT=3000 E2E_EDITOR_EMAIL=… E2E_EDITOR_PASSWORD=… pnpm test:e2e e2e/editorial.spec.ts
 *
 * Server `NEXT_PUBLIC_SITE_URL` (Payload `serverURL`) origin'ida ishlashi kerak: Payload CSRF
 * ro'yxati cookie'ni faqat shu origin'dan qabul qiladi (lokal — `http://localhost:3000`).
 * `E2E_SHOTS_DIR` berilsa — skrinshotlar shu papkaga saqlanadi.
 */
const EMAIL = process.env.E2E_EDITOR_EMAIL
const PASSWORD = process.env.E2E_EDITOR_PASSWORD
const SHOTS = process.env.E2E_SHOTS_DIR

const TAKE_TITLE = 'OpenAI unveils a smaller reasoning model for developers'
const REJECT_TITLE = 'Apple releases a security update for iOS'

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

async function selectOption(page: Page, field: string, label: string) {
  await page.locator(`#field-${field} .rs__control`).click()
  await page.locator('.rs__option', { hasText: label }).first().click()
}

/** Autosave (drafts, 10 s) — holat o'zgarishi versiyaga yozilishini kutamiz. */
async function waitForAutosave(page: Page, change: () => Promise<void>) {
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/api/posts/') &&
      response.url().includes('autosave=true') &&
      response.request().method() === 'PATCH',
    { timeout: 30_000 },
  )
  await change()
  expect((await saved).ok()).toBe(true)
}

test.describe('tahririyat navbati (admin)', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EDITOR_EMAIL / E2E_EDITOR_PASSWORD berilmagan')
  test.setTimeout(180_000)

  test('anonim — login sahifasiga yo‘naltiriladi, endpoint 401', async ({ page, request }) => {
    await page.goto('/admin/news-queue')
    await expect(page).toHaveURL(/\/admin\/login/)
    const response = await request.post('/api/scraped-items/1/take', { data: {} })
    expect(response.status()).toBe(401)
  })

  test('navbat → rad etish → qoralama → yozish → publish', async ({ page }) => {
    const startedAt = Date.now()
    await page.goto('/admin/login')
    await page.locator('#field-email').fill(EMAIL!)
    await page.locator('#field-password').fill(PASSWORD!)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/admin\/?$/)
    await expect(page.getByTestId('editorial-stats')).toBeVisible()
    await shot(page, '01-dashboard')

    // Navbat — faqat fixture manbasi (lokal DB'dagi haqiqiy elementlardan ajratish uchun).
    await page.getByTestId('editorial-stats').locator('[data-stat="scraped"]').click()
    await page.waitForURL(/\/admin\/news-queue/)
    await expect(page.getByRole('heading', { level: 1, name: 'Yangiliklar navbati' })).toBeVisible()
    await page.locator('select[name="source"]').selectOption({ label: 'E2E fixture manba' })
    await page.getByRole('button', { name: 'Ko‘rsatish' }).click()
    await expect(page).toHaveURL(/source=\d+/)
    await expect(page.getByTestId('queue-item')).toHaveCount(4)
    await expect(page.getByTestId('scoring-notice')).toBeVisible()
    await shot(page, '02-queue')

    // Rad etish (sabab bilan) → navbatdan yo'qoladi.
    const rejected = page.getByTestId('queue-item').filter({ hasText: REJECT_TITLE })
    await rejected.getByRole('button', { name: 'Rad etish', exact: true }).click()
    await rejected.getByLabel('Rad etish sababi').fill('Mavzuga oid emas (e2e)')
    await shot(page, '03-reject-reason')
    await rejected.getByRole('button', { name: 'Rad etishni tasdiqlash' }).click()
    await expect(page.getByTestId('queue-item')).toHaveCount(3)
    await expect(page.getByTestId('queue-item').filter({ hasText: REJECT_TITLE })).toHaveCount(0)
    await shot(page, '04-after-reject')

    // Rad etilganlar filtrida — sababi bilan.
    const url = new URL(page.url())
    url.searchParams.set('status', 'rejected')
    await page.goto(url.toString())
    await expect(page.getByTestId('queue-item').filter({ hasText: REJECT_TITLE })).toContainText(
      'Mavzuga oid emas (e2e)',
    )
    url.searchParams.set('status', 'new')
    await page.goto(url.toString())

    // Qoralamaga olish → post tahrirlash sahifasi, yon panelda asl manba.
    const taken = page.getByTestId('queue-item').filter({ hasText: TAKE_TITLE })
    await taken.getByRole('button', { name: 'Qoralamaga olish' }).click()
    await page.waitForURL(/\/admin\/collections\/posts\/\d+$/)
    const postUrl = page.url()
    const panel = page.getByTestId('source-panel')
    await expect(panel).toContainText(TAKE_TITLE)
    await expect(panel.getByRole('link', { name: /Asl maqolani ochish/ })).toHaveAttribute(
      'href',
      /e2e-fixture\.example/,
    )
    await shot(page, '05-post-draft-source-panel')

    // Qo'lda yozish: sarlavha, slug, lid, matn.
    const suffix = Date.now().toString(36)
    await page
      .locator('#field-title')
      .fill('OpenAI dasturchilar uchun kichik fikrlovchi model chiqardi')
    await page.locator('#field-slug').fill(`openai-kichik-model-${suffix}`)
    await page
      .locator('#field-excerpt')
      .fill('Yangi model arzonroq va tezroq, API orqali bugundan mavjud.')
    const editor = page.locator('.rich-text-lexical [contenteditable="true"]').first()
    await editor.click()
    await editor.pressSequentially(
      'OpenAI dasturchilar uchun yangi, kichikroq fikrlovchi modelni taqdim etdi. ' +
        'Model kod yozish yordamchilari va agentlar uchun moʻljallangan.',
    )

    // Workflow: draft → in_progress → review (autosave), keyin publish.
    await waitForAutosave(page, () => selectOption(page, 'workflowStatus', 'Ishlanmoqda'))
    await waitForAutosave(page, () => selectOption(page, 'workflowStatus', 'Tekshiruvda'))
    await shot(page, '06-post-written-review')

    // Review ro'yxatida ko'rinadi.
    await page.goto('/admin/review')
    const reviewItem = page
      .getByTestId('review-item')
      .filter({ hasText: 'OpenAI dasturchilar uchun kichik fikrlovchi model chiqardi' })
    await expect(reviewItem).toBeVisible()
    await shot(page, '07-review-list')

    await reviewItem.getByRole('link', { name: 'Tekshirish' }).click()
    await page.waitForURL(postUrl)
    await page
      .getByRole('button', { name: /nashr qilish/i })
      .first()
      .click()
    await expect(page.locator('.doc-controls')).toContainText('Holat: Nashr qilingan', {
      timeout: 30_000,
    })
    await page.reload()
    await expect(page.locator('#field-workflowStatus')).toContainText('Chop etilgan')
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000)
    await shot(page, '08-post-published')
    test.info().annotations.push({ type: 'flow-seconds', description: String(elapsedSec) })
    console.log(`E2E tahririyat oqimi: ${elapsedSec} s`)
    expect(elapsedSec).toBeLessThan(600)

    // Dashboard: bugun chop etilgan ≥ 1.
    await page.goto('/admin')
    const published = page.getByTestId('editorial-stats').locator('[data-stat="published"]')
    await expect(published).not.toContainText(/^0/)
    await shot(page, '09-dashboard-after')
  })
})
