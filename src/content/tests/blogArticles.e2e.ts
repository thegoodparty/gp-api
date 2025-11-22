import { test, expect } from '@playwright/test'

test.describe('CMS Content - Blog Articles', () => {
  test('should fetch all blog articles', async ({ request }) => {
    const response = await request.get('/v1/content/blog-articles')

    expect(response.status()).toBe(200)

    const content = (await response.json()) as Array<{
      contentId: string
      summary: string
      author: string
      title: string
      slug: string
      tags: unknown[]
      section: object
    }>
    expect(Array.isArray(content)).toBe(true)
    expect(content.length).toBeGreaterThan(0)

    content.forEach((article) => {
      expect(article).toHaveProperty('contentId')
      expect(article).toHaveProperty('summary')
      expect(article).toHaveProperty('author')
      expect(article).toHaveProperty('title')
      expect(article).toHaveProperty('slug')
      expect(article).toHaveProperty('tags')
      expect(article).toHaveProperty('section')
    })
  })

  test('should fetch blog articles with limit', async ({ request }) => {
    const limit = 5
    const response = await request.get(
      `/v1/content/blog-articles?limit=${limit}`,
    )

    expect(response.status()).toBe(200)

    const content = (await response.json()) as Array<{
      contentId: string
      summary: string
      author: string
      title: string
      slug: string
      tags: unknown[]
      section: object
    }>
    expect(content.length).toBeLessThanOrEqual(limit)

    content.forEach((article) => {
      expect(article).toHaveProperty('contentId')
      expect(article).toHaveProperty('summary')
      expect(article).toHaveProperty('author')
      expect(article).toHaveProperty('title')
      expect(article).toHaveProperty('slug')
      expect(article).toHaveProperty('tags')
      expect(article).toHaveProperty('section')
    })
  })

  test('should fetch blog article titles', async ({ request }) => {
    const response = await request.get('/v1/content/type/blogArticleTitles')

    expect(response.status()).toBe(200)

    const content = (await response.json()) as Array<{
      title: string
      slug: string
    }>
    expect(Array.isArray(content)).toBe(true)

    content.forEach((item) => {
      expect(item).toHaveProperty('title')
      expect(item).toHaveProperty('slug')
      expect(typeof item.title).toBe('string')
      expect(typeof item.slug).toBe('string')
    })
  })

  test('should fetch single blog article by slug', async ({ request }) => {
    const articlesResponse = await request.get(
      '/v1/content/blog-articles?limit=1',
    )
    const articles = (await articlesResponse.json()) as Array<{ slug: string }>

    if (articles.length === 0) {
      test.skip()
      return
    }

    const slug = articles[0].slug
    const response = await request.get(`/v1/content/blog-article/${slug}`)

    expect(response.status()).toBe(200)

    const article = (await response.json()) as object
    expect(article).toBeInstanceOf(Object)
  })

  test('should fetch blog articles by tag', async ({ request }) => {
    const tag = 'how-to-run-for-office'
    const response = await request.get(
      `/v1/content/blog-articles-by-tag/${tag}`,
    )

    expect(response.status()).toBe(200)

    const articles = (await response.json()) as unknown[]
    expect(Array.isArray(articles)).toBe(true)
    expect(articles.length).toBeGreaterThan(0)
  })
})
