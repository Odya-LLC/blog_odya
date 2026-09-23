import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Jonli feed tekshiruvi tarmoqqa chiqadi va domen bo'yicha pauza qiladi
    testTimeout: 120_000,
  },
})
