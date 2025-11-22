import { test, expect } from '@playwright/test'

test.describe('CMS Content - FAQ Articles', () => {
  test('should fetch all FAQ articles', async ({ request }) => {
    const response = await request.get('/v1/content/type/faqArticle')

    expect(response.status()).toBe(200)

    const content = (await response.json()) as Array<{ type: string }>
    expect(Array.isArray(content)).toBe(true)
    expect(content.length).toBeGreaterThan(0)

    content.forEach((article) => {
      expect(article.type).toBe('faqArticle')
    })
  })

  test('should have category if available', async ({ request }) => {
    const response = await request.get('/v1/content/type/faqArticle')
    const content = (await response.json()) as Array<{
      category?: {
        id: string
        fields: object
      }
      id: string
    }>

    content.forEach((article) => {
      if (article.category) {
        expect(typeof article.category.id).toBe('string')
        expect(article.category.id).not.toBe(article.id)
        expect(typeof article.category.fields).toBe('object')
      }
    })
  })

  test('should have articleBody', async ({ request }) => {
    const response = await request.get('/v1/content/type/faqArticle')
    const content = (await response.json()) as Array<{ articleBody: object }>

    content.forEach((article) => {
      expect(typeof article.articleBody).toBe('object')
    })
  })
})
