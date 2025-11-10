import { test, expect } from '@playwright/test'

test.describe('Health Endpoint', () => {
  test('GET /v1/health should return OK', async ({ request }) => {
    const response = await request.get('/v1/health')

    expect(response.ok()).toBeTruthy()
    expect(response.status()).toBe(200)

    const body = await response.text()
    expect(body).toBe('OK')
  })

  test('GET /v1/health should have correct headers', async ({ request }) => {
    const response = await request.get('/v1/health')

    expect(response.headers()['content-type']).toContain('text/plain')
  })
})
