import { test, expect } from '@playwright/test'
import {
  registerUser,
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
} from '../../utils/auth.util'

interface Website {
  id: number
  campaignId: number
  status: string
  vanityPath: string | null
  content: unknown
  createdAt: string
  updatedAt: string
  campaign?: {
    details: unknown
    user: {
      firstName: string
      lastName: string
    }
  }
}

test.describe('Websites - Vanity Path', () => {
  let testUserId: number | undefined
  let authToken: string | undefined

  test.afterEach(async ({ request }) => {
    if (testUserId && authToken) {
      await deleteUser(request, testUserId, authToken)
      testUserId = undefined
      authToken = undefined
    }
  })

  test('should validate vanity path availability', async ({ request }) => {
    const email = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const password = generateRandomPassword()

    const registerResponse = await registerUser(request, {
      firstName,
      lastName,
      email,
      password,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const vanityPath = `unique-path-${Date.now()}`

    const response = await request.post('/v1/websites/validate-vanity-path', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        vanityPath,
      },
    })

    expect(response.status()).toBe(201)

    const result = (await response.json()) as { available: boolean }
    expect(result.available).toBe(true)
  })

  test('should detect vanity path conflict', async ({ request }) => {
    const email1 = generateRandomEmail()
    const email2 = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const password = generateRandomPassword()

    const registerResponse1 = await registerUser(request, {
      firstName,
      lastName,
      email: email1,
      password,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${registerResponse1.token}`,
      },
    })

    const vanityPath = `shared-path-${Date.now()}`

    await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${registerResponse1.token}`,
      },
      multipart: {
        vanityPath,
      },
    })

    const registerResponse2 = await registerUser(request, {
      firstName,
      lastName,
      email: email2,
      password,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    testUserId = registerResponse2.user.id
    authToken = registerResponse2.token

    await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const response = await request.post('/v1/websites/validate-vanity-path', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        vanityPath,
      },
    })

    expect(response.status()).toBe(201)

    const result = (await response.json()) as { available: boolean }
    expect(result.available).toBe(false)

    await deleteUser(
      request,
      registerResponse1.user.id,
      registerResponse1.token,
    )
  })

  test('should view published website by vanity path', async ({ request }) => {
    const email = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const password = generateRandomPassword()

    const registerResponse = await registerUser(request, {
      firstName,
      lastName,
      email,
      password,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const vanityPath = `view-path-${Date.now()}`

    await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        vanityPath,
        status: 'published',
        'main[title]': 'Public Website',
      },
    })

    const response = await request.get(`/v1/websites/${vanityPath}/view`)

    expect(response.status()).toBe(200)

    const website = (await response.json()) as Website
    expect(website.vanityPath).toBe(vanityPath)
    expect(website.status).toBe('published')
    expect(website.campaign).toBeDefined()
    expect(website.campaign?.user).toBeDefined()
  })

  test('should return 403 for unpublished website view', async ({
    request,
  }) => {
    const email = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const password = generateRandomPassword()

    const registerResponse = await registerUser(request, {
      firstName,
      lastName,
      email,
      password,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const vanityPath = `unpublished-path-${Date.now()}`

    await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        vanityPath,
        status: 'unpublished',
      },
    })

    const response = await request.get(`/v1/websites/${vanityPath}/view`)

    expect(response.status()).toBe(403)
  })

  test('should return 404 for non-existent vanity path', async ({
    request,
  }) => {
    const response = await request.get(
      '/v1/websites/non-existent-path-123456789/view',
    )

    expect(response.status()).toBe(404)
  })
})
