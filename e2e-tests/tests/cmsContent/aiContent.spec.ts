import { test, expect } from '@playwright/test'

test.describe('CMS Content - AI Content', () => {
  test('should fetch candidate content prompts', async ({ request }) => {
    const response = await request.get('/v1/content/type/candidateContentPrompts')

    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(typeof data).toBe('object')

    Object.keys(data).forEach((key) => {
      expect(typeof key).toBe('string')
      expect(typeof data[key]).toBe('string')
    })
  })

  test('should fetch AI content categories', async ({ request }) => {
    const response = await request.get('/v1/content/type/aiContentCategories')

    expect(response.status()).toBe(200)

    const categories = await response.json()
    expect(Array.isArray(categories)).toBe(true)

    categories.forEach((category: any) => {
      expect(category).toHaveProperty('name')
      expect(category).toHaveProperty('templates')
      expect(typeof category.name).toBe('string')
      expect(Array.isArray(category.templates)).toBe(true)

      category.templates.forEach((template: any) => {
        expect(template).toHaveProperty('key')
        expect(template).toHaveProperty('name')
        expect(typeof template.key).toBe('string')
        expect(typeof template.name).toBe('string')
      })
    })
  })

  test('should fetch AI chat prompts', async ({ request }) => {
    const response = await request.get('/v1/content/type/aiChatPrompts')

    expect(response.status()).toBe(200)

    const prompts = await response.json()
    expect(Array.isArray(prompts)).toBe(true)

    prompts.forEach((item: any) => {
      expect(typeof item).toBe('object')
      expect(item).toHaveProperty('General')

      const general = item.General
      expect(general).toHaveProperty('name')
      expect(general).toHaveProperty('systemPrompt')
      expect(general).toHaveProperty('candidateJson')
      expect(general).toHaveProperty('initialPrompt')
      expect(general).toHaveProperty('id')
      expect(typeof general.name).toBe('string')
      expect(typeof general.systemPrompt).toBe('string')
      expect(typeof general.candidateJson).toBe('object')
      expect(typeof general.initialPrompt).toBe('string')
      expect(typeof general.id).toBe('string')
    })
  })

  test('should fetch prompt input fields', async ({ request }) => {
    const response = await request.get('/v1/content/type/promptInputFields')

    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(typeof data).toBe('object')

    Object.keys(data).forEach((key) => {
      const subArray = data[key]
      expect(Array.isArray(subArray)).toBe(true)

      subArray.forEach((subItem: any) => {
        expect(subItem).toHaveProperty('title')
        expect(subItem).toHaveProperty('helperText')
        expect(typeof subItem.title).toBe('string')
        expect(typeof subItem.helperText).toBe('string')
      })
    })
  })

  test('should fetch content prompts questions', async ({ request }) => {
    const response = await request.get('/v1/content/type/contentPromptsQuestions')

    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(typeof data).toBe('object')

    Object.values(data).forEach((value) => {
      expect(typeof value).toBe('boolean')
    })
  })
})

