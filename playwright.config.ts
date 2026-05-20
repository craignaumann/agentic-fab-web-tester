import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // Single worker — tests share a SQLite DB seeded once per run.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:7332',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
})
