import { test, expect } from '@playwright/test'

test.describe('CMS Content - Static Content', () => {
  test('should fetch pledge', async ({ request }) => {
    const response = await request.get('/v1/content/type/pledge')

    expect(response.status()).toBe(200)
  })
})
