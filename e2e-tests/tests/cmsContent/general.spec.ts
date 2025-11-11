import { test, expect } from '@playwright/test'

test.describe('CMS Content - General', () => {
  test('should fetch all CMS content', async ({ request }) => {
    const response = await request.get('/v1/content')

    expect(response.status()).toBe(200)

    const entries = (await response.json()) as Array<{ id: string }>
    expect(Array.isArray(entries)).toBe(true)
    expect(entries.length).toBeGreaterThan(0)

    const firstEntry = entries[0]
    expect(firstEntry).toHaveProperty('id')
  })

  test('should fetch CMS content by ID', async ({ request }) => {
    const allResponse = await request.get('/v1/content')
    const entries = (await allResponse.json()) as Array<{ id: string }>

    if (entries.length === 0) {
      test.skip()
      return
    }

    const testId = entries[0].id

    const response = await request.get(`/v1/content/${testId}`)

    expect(response.status()).toBe(200)

    const entry = (await response.json()) as object
    expect(entry).toBeInstanceOf(Object)
  })
})
