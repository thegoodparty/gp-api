import { defineConfig } from '@playwright/test'
import { config } from 'dotenv'
import { join } from 'path'

config({ path: join(__dirname, '.env') })

export default defineConfig({
  testDir: '../src',
  testMatch: '**/tests/**/*.e2e.ts',
  outputDir: join(__dirname, 'test-results'),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: join(__dirname, 'playwright-report') }],
    ['json', { outputFile: join(__dirname, 'test-results/results.json') }],
    ['list'],
  ],
  use: {
    baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
    extraHTTPHeaders: {
      Accept: 'application/json',
    },
    trace: process.env.CI ? 'retain-on-failure' : 'off',
  },
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
})
