import { defineConfig } from '@playwright/test'
import { config } from 'dotenv'
import { join } from 'path'

config({ path: join(__dirname, '.env') })

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  outputDir: join(__dirname, 'test-results'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: join(__dirname, 'playwright-report') }],
    ['json', { outputFile: join(__dirname, 'test-results/results.json') }],
  ],
  use: {
    baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
    extraHTTPHeaders: {
      Accept: 'application/json',
    },
  },
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
})
