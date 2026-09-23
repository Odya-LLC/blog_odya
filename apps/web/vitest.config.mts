import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Integratsion testlar bitta Postgres/MinIO bilan ishlaydi — ketma-ket.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
