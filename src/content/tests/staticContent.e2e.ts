import { test, expect } from '@playwright/test'

test.describe('CMS Content - Static Content', () => {
  test('should fetch article categories', async ({ request }) => {
    const response = await request.get('/v1/content/type/articleCategories')

    expect(response.status()).toBe(200)
  })

  test('should fetch candidate testimonials', async ({ request }) => {
    const response = await request.get('/v1/content/type/candidateTestimonials')

    expect(response.status()).toBe(200)
  })

  test('should fetch Good Party team members', async ({ request }) => {
    const response = await request.get('/v1/content/type/goodPartyTeamMembers')

    expect(response.status()).toBe(200)
  })

  test('should fetch terms of service', async ({ request }) => {
    const response = await request.get('/v1/content/type/termsOfService')

    expect(response.status()).toBe(200)
  })

  test('should fetch pledge', async ({ request }) => {
    const response = await request.get('/v1/content/type/pledge')

    expect(response.status()).toBe(200)
  })

  test('should fetch privacy page', async ({ request }) => {
    const response = await request.get('/v1/content/type/privacyPage')

    expect(response.status()).toBe(200)
  })

  test('should fetch blog home', async ({ request }) => {
    const response = await request.get('/v1/content/type/blogHome')

    expect(response.status()).toBe(200)
  })
})
