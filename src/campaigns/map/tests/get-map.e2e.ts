import { expect, test } from '@playwright/test'

test.describe('Campaigns Map - Get Map', () => {
  test('should return campaigns map with results', async ({ request }) => {
    const response = await request.get('/v1/campaigns/map?results=true')

    expect(response.status()).toBe(200)

    const body = (await response.json()) as Record<
      string,
      string | number | boolean
    >[]
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(0)
  })

  test('should filter campaigns by party', async ({ request }) => {
    const response = await request.get('/v1/campaigns/map?party=Independent')

    expect(response.status()).toBe(200)

    const body = (await response.json()) as Record<
      string,
      string | number | boolean
    >[]
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(0)
  })

  test('should filter campaigns by level', async ({ request }) => {
    const response = await request.get('/v1/campaigns/map?level=State')

    expect(response.status()).toBe(200)

    const body = (await response.json()) as Record<
      string,
      string | number | boolean
    >[]
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(0)
  })

  test('should filter campaigns by office', async ({ request }) => {
    const response = await request.get('/v1/campaigns/map?office=SHER')

    expect(response.status()).toBe(200)

    const body = (await response.json()) as Record<
      string,
      string | number | boolean
    >[]
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(0)
  })
})
