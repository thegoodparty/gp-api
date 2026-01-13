import { expect, test } from '@playwright/test'

test.describe('CMS Content - Article Tags', () => {
  test('should fetch all article tags', async ({ request }) => {
    const response = await request.get('/v1/content/article-tags')

    expect(response.status()).toBe(200)

    const tags = (await response.json()) as Array<{
      name: string
      slug: string
    }>
    expect(Array.isArray(tags)).toBe(true)

    const tagNames = new Set()
    const tagSlugs = new Set()

    tags.forEach((tag) => {
      expect(tag).toHaveProperty('name')
      expect(tag).toHaveProperty('slug')
      expect(tagNames.has(tag.name)).toBe(false)
      expect(tagSlugs.has(tag.slug)).toBe(false)
      tagNames.add(tag.name)
      tagSlugs.add(tag.slug)
    })
  })

  test('should fetch article tags from type endpoint', async ({ request }) => {
    const response = await request.get('/v1/content/type/articleTag')

    expect(response.status()).toBe(200)

    const tagsArray = (await response.json()) as Array<
      Record<string, { tagName: string; articleSlugs: string[] }>
    >
    expect(Array.isArray(tagsArray)).toBe(true)
    expect(tagsArray.length).toBeGreaterThan(0)

    const tagsObj = tagsArray[0]
    expect(typeof tagsObj).toBe('object')

    const tagSlugs = Object.keys(tagsObj)
    expect(tagSlugs.length).toBeGreaterThan(0)

    const tagNames = new Set()
    const uniqueSlugs = new Set()

    tagSlugs.forEach((slug) => {
      const tag = tagsObj[slug]
      expect(tag).toHaveProperty('tagName')
      expect(tag).toHaveProperty('articleSlugs')
      expect(Array.isArray(tag.articleSlugs)).toBe(true)
      expect(tagNames.has(tag.tagName)).toBe(false)
      expect(uniqueSlugs.has(slug)).toBe(false)
      tagNames.add(tag.tagName)
      uniqueSlugs.add(slug)
    })
  })
})
