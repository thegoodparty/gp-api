import { expect, test } from '@playwright/test'

test.describe('CMS Content - Blog Articles By Section', () => {
  test('should fetch all blog articles by section', async ({ request }) => {
    const response = await request.get('/v1/content/blog-articles/by-section')

    expect(response.status()).toBe(200)

    const articlesBySection = (await response.json()) as Record<
      string,
      Array<{ section: { fields: { slug: string } } }>
    >
    const sectionSlugs = Object.keys(articlesBySection)

    expect(sectionSlugs.length).toBeGreaterThan(1)

    sectionSlugs.forEach((slug) => {
      const articles = articlesBySection[slug]
      expect(Array.isArray(articles)).toBe(true)

      articles.forEach((article) => {
        expect(article.section.fields.slug).toBe(slug)
      })
    })
  })

  test('should fetch all blog articles by section with limit', async ({
    request,
  }) => {
    const limit = 5
    const response = await request.get(
      `/v1/content/blog-articles/by-section?limit=${limit}`,
    )

    expect(response.status()).toBe(200)

    const articlesBySection = (await response.json()) as Record<
      string,
      Array<{ section: { fields: { slug: string } } }>
    >
    const sectionSlugs = Object.keys(articlesBySection)

    expect(sectionSlugs.length).toBeGreaterThan(1)

    sectionSlugs.forEach((slug) => {
      const articles = articlesBySection[slug]
      expect(Array.isArray(articles)).toBe(true)
      expect(articles.length).toBeLessThanOrEqual(limit)

      articles.forEach((article) => {
        expect(article.section.fields.slug).toBe(slug)
      })
    })
  })

  test('should fetch blog articles by specific section (news)', async ({
    request,
  }) => {
    const sectionSlug = 'news'
    const response = await request.get(
      `/v1/content/blog-articles/by-section/${sectionSlug}`,
    )

    expect(response.status()).toBe(200)

    const articlesBySection = (await response.json()) as Record<
      string,
      Array<{ section: { fields: { slug: string } } }>
    >
    expect(articlesBySection[sectionSlug]).toBeDefined()

    const sectionArticles = articlesBySection[sectionSlug]
    expect(Array.isArray(sectionArticles)).toBe(true)

    sectionArticles.forEach((article) => {
      expect(article.section.fields.slug).toBe(sectionSlug)
    })
  })

  test('should fetch blog articles by specific section with limit', async ({
    request,
  }) => {
    const sectionSlug = 'news'
    const limit = 5
    const response = await request.get(
      `/v1/content/blog-articles/by-section/${sectionSlug}?limit=${limit}`,
    )

    expect(response.status()).toBe(200)

    const articlesBySection = (await response.json()) as Record<
      string,
      Array<{ section: { fields: { slug: string } } }>
    >
    expect(articlesBySection[sectionSlug]).toBeDefined()

    const sectionArticles = articlesBySection[sectionSlug]
    expect(Array.isArray(sectionArticles)).toBe(true)
    expect(sectionArticles.length).toBeLessThanOrEqual(limit)

    sectionArticles.forEach((article) => {
      expect(article.section.fields.slug).toBe(sectionSlug)
    })
  })
})
