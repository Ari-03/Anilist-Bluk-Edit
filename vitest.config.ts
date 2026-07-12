import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/index.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        statements: 80,
        'src/modules/accounts/**': { branches: 90 },
        'src/modules/anilist/**': { branches: 90 },
        'src/modules/bulk-edit/**': { branches: 90 },
        'src/modules/media-list/**': { branches: 90 },
      },
    },
  },
})
