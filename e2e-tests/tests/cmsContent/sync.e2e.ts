import { test, expect } from '@playwright/test'

test.describe('CMS Content - Sync', () => {
  test('should sync CMS content successfully', async ({ request }) => {
    const response = await request.get('/v1/content/sync')

    expect(response.status()).toBe(200)

    const data = (await response.json()) as {
      entriesCount: number
      createEntriesCount: number
      updateEntriesCount: number
      deletedEntriesCount: number
    }
    expect(data).toHaveProperty('entriesCount')
    expect(data).toHaveProperty('createEntriesCount')
    expect(data).toHaveProperty('updateEntriesCount')
    expect(data).toHaveProperty('deletedEntriesCount')
    expect(Number.isInteger(data.entriesCount)).toBe(true)
    expect(Number.isInteger(data.createEntriesCount)).toBe(true)
    expect(Number.isInteger(data.updateEntriesCount)).toBe(true)
    expect(Number.isInteger(data.deletedEntriesCount)).toBe(true)
    expect(data.entriesCount).toBeGreaterThanOrEqual(0)
    expect(data.createEntriesCount).toBeGreaterThanOrEqual(0)
    expect(data.updateEntriesCount).toBeGreaterThanOrEqual(0)
    expect(data.deletedEntriesCount).toBeGreaterThanOrEqual(0)
  })
})
