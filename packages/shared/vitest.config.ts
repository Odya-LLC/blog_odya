import { defineConfig } from 'vitest/config'

// Jonli feed tekshiruvi (test/feeds.live.test.ts) tarmoqqa chiqadi — `pnpm test`/CI'da
// umuman yig'ilmaydi, faqat `pnpm check:feeds` (RUN_FEED_CHECKS=1) orqali qo'lda ishga tushadi.
const RUN_FEEDS = process.env.RUN_FEED_CHECKS === '1'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: RUN_FEEDS ? ['**/node_modules/**'] : ['**/node_modules/**', 'test/**/*.live.test.ts'],
    // forks pool'da jonli tekshiruv worker'i Windows'da kutilmaganda yiqiladi — threads ishonchli
    pool: RUN_FEEDS ? 'threads' : 'forks',
    // Jonli feed tekshiruvi domen bo'yicha pauza qiladi
    testTimeout: RUN_FEEDS ? 120_000 : 5_000,
  },
})
