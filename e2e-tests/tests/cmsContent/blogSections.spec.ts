import { test, expect } from '@playwright/test'

test.describe('CMS Content - Blog Sections', () => {
  test('should fetch all blog article sections', async ({ request }) => {
    const response = await request.get('/v1/content/blog-articles/sections')

    expect(response.status()).toBe(200)

    const sections = await response.json()
    expect(Array.isArray(sections)).toBe(true)
    expect(sections.length).toBeGreaterThan(0)

    const uniqueIds = new Set()
    sections.forEach((section: any) => {
      expect(section).toHaveProperty('id')
      expect(uniqueIds.has(section.id)).toBe(false)
      uniqueIds.add(section.id)
    })
  })

  test('should fetch specific blog article section by slug', async ({ request }) => {
    const sectionSlug = 'news'
    const response = await request.get(`/v1/content/blog-articles/sections/${sectionSlug}`)

    expect(response.status()).toBe(200)

    const section = await response.json()
    expect(section).toHaveProperty('fields')
    expect(section.fields.slug).toBe(sectionSlug)
  })

  test('should fetch blog sections with articles', async ({ request }) => {
    const response = await request.get('/v1/content/type/blogSections')

    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)

    body.forEach((item: any) => {
      expect(item).toHaveProperty('fields')
      expect(item).toHaveProperty('id')
      expect(item).toHaveProperty('articles')
      expect(Array.isArray(item.articles)).toBe(true)
      expect(item.articles.length).toBeGreaterThan(0)
    })
  })
})

