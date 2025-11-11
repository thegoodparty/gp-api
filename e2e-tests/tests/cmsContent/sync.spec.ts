import { test, expect } from '@playwright/test'

test.describe('CMS Content - Sync', () => {
  test('should sync CMS content successfully', async ({ request }) => {
    const response = await request.get('/v1/content/sync')

    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('entriesCount')
    expect(data).toHaveProperty('createEntriesCount')
    expect(data).toHaveProperty('updateEntriesCount')
    expect(data).toHaveProperty('deletedEntriesCount')
    expect(data.entriesCount).toBeGreaterThan(100)
    expect(data.deletedEntriesCount).toBe(0)
  })
})

