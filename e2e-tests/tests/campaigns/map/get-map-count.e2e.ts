import { test, expect } from '@playwright/test'

interface CountResponse {
  count: number
}

test.describe('Campaigns Map - Get Map Count', () => {
  test('should return campaigns count', async ({ request }) => {
    const response = await request.get('/v1/campaigns/map/count')

    expect(response.status()).toBe(200)

    const body = (await response.json()) as CountResponse
    expect(body).toHaveProperty('count')
    expect(typeof body.count).toBe('number')
    expect(body.count).toBeGreaterThanOrEqual(0)
  })

  test('should return campaigns count with results filter', async ({
    request,
  }) => {
    const response = await request.get('/v1/campaigns/map/count?results=true')

    expect(response.status()).toBe(200)

    const body = (await response.json()) as CountResponse
    expect(body).toHaveProperty('count')
    expect(typeof body.count).toBe('number')
    expect(body.count).toBeGreaterThanOrEqual(0)
  })

  test('should return campaigns count filtered by state', async ({
    request,
  }) => {
    const response = await request.get('/v1/campaigns/map/count?state=CA')

    expect(response.status()).toBe(200)

    const body = (await response.json()) as CountResponse
    expect(body).toHaveProperty('count')
    expect(typeof body.count).toBe('number')
    expect(body.count).toBeGreaterThanOrEqual(0)
  })
})

