import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright smoke testlari (M1-05): bosh sahifa → kategoriya → maqola, lotin va kirill.
 *
 * Oldindan: `pnpm seed && pnpm build` (demo postlar). Server: `next start` (production rejim, ISR).
 * DB tashqaridan o'zgartirilgan bo'lsa (seed qayta), eski ISR keshini tozalang: `rm -rf apps/web/.next`.
 * Tayyor serverga qarshi: `E2E_BASE_URL=https://… pnpm test:e2e`.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next start -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { NODE_OPTIONS: '--no-deprecation' },
      },
})
