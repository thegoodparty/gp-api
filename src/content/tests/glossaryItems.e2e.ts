import { test, expect } from '@playwright/test'

test.describe('CMS Content - Glossary Items', () => {
  test('should fetch all glossary items', async ({ request }) => {
    const response = await request.get('/v1/content/type/glossaryItem')

    expect(response.status()).toBe(200)

    const items = (await response.json()) as Array<{
      slug: string
      banner?: {
        largeImage: object
        smallImage: object
      }
    }>
    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBeGreaterThan(0)

    items.forEach((item) => {
      expect(item).toHaveProperty('slug')
      expect(typeof item.slug).toBe('string')

      if (item.banner) {
        expect(item.banner).toHaveProperty('largeImage')
        expect(item.banner).toHaveProperty('smallImage')
        expect(typeof item.banner.largeImage).toBe('object')
        expect(typeof item.banner.smallImage).toBe('object')
      }
    })
  })

  test('should fetch glossary items grouped by alpha', async ({ request }) => {
    const response = await request.get(
      '/v1/content/type/glossaryItem/by-letter',
    )

    expect(response.status()).toBe(200)

    const groupedItems = (await response.json()) as Record<
      string,
      Array<{ title: string; slug: string }>
    >
    const letters = Object.keys(groupedItems)

    expect(letters.length).toBeGreaterThan(0)

    letters.forEach((letter) => {
      const group = groupedItems[letter]
      expect(Array.isArray(group)).toBe(true)

      group.forEach((item) => {
        expect(item.title.toLowerCase().startsWith(letter.toLowerCase())).toBe(
          true,
        )
        expect(item.slug.startsWith(letter.toLowerCase())).toBe(true)
      })
    })
  })

  test('should fetch glossary items mapped to slug', async ({ request }) => {
    const response = await request.get('/v1/content/type/glossaryItem/by-slug')

    expect(response.status()).toBe(200)

    const mappedItems = (await response.json()) as Record<
      string,
      { slug: string }
    >
    const slugs = Object.keys(mappedItems)

    expect(slugs.length).toBeGreaterThan(0)

    slugs.forEach((slug) => {
      const item = mappedItems[slug]
      expect(item.slug).toBe(slug)
    })
  })
})
