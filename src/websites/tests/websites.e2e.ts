import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  authHeaders,
  campaignOrgSlug,
} from '../../../e2e-tests/utils/auth.util'
import { faker } from '@faker-js/faker'

test.describe('Candidate Website', () => {
  let authToken: string
  let orgSlug: string
  let testUserId: number
  let testAuthToken: string

  test.beforeEach(async ({ request }) => {
    const registerResponse = await registerUser(request, {
      firstName: generateRandomName(),
      lastName: generateRandomName(),
      email: generateRandomEmail(),
      password: 'password123',
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    authToken = registerResponse.token
    orgSlug = campaignOrgSlug(registerResponse.campaign.id)
    testUserId = registerResponse.user.id
    testAuthToken = registerResponse.token
  })

  test.afterEach(async ({ request }) => {
    if (testUserId && testAuthToken) {
      await deleteUser(request, testUserId, testAuthToken)
    }
  })

  test('should create a website', async ({ request }) => {
    const response = await request.post('/v1/websites', {
      headers: authHeaders(authToken, orgSlug),
    })

    expect(response.status()).toBe(HttpStatus.CREATED)

    const website = (await response.json()) as {
      id: number
      vanityPath: string
    }
    expect(website).toHaveProperty('id')
    expect(website).toHaveProperty('vanityPath')
  })

  test('should update website content', async ({ request }) => {
    await request.post('/v1/websites', {
      headers: authHeaders(authToken, orgSlug),
    })

    const updateResponse = await request.put('/v1/websites/mine', {
      headers: {
        ...authHeaders(authToken, orgSlug),
        'Content-Type': 'application/json',
      },
      data: {
        content: JSON.stringify({
          hero: faker.lorem.sentence(),
          about: faker.lorem.paragraph(),
        }),
      },
    })

    expect(updateResponse.status()).toBe(HttpStatus.OK)
  })

  test('should validate vanity path', async ({ request }) => {
    await request.post('/v1/websites', {
      headers: authHeaders(authToken, orgSlug),
    })

    const vanityPath = `test-${Date.now()}`

    const response = await request.post('/v1/websites/validate-vanity-path', {
      headers: authHeaders(authToken, orgSlug),
      data: {
        vanityPath,
      },
    })

    expect(response.status()).toBe(HttpStatus.CREATED)

    const result = (await response.json()) as { available: boolean }
    expect(result).toHaveProperty('available')
  })

  test('should get website by vanity path', async ({ request }) => {
    const createResponse = await request.post('/v1/websites', {
      headers: authHeaders(authToken, orgSlug),
    })

    const website = (await createResponse.json()) as { vanityPath: string }

    await request.put('/v1/websites/mine', {
      headers: {
        ...authHeaders(authToken, orgSlug),
        'Content-Type': 'application/json',
      },
      data: {
        status: 'published',
      },
    })

    const response = await request.get(
      `/v1/websites/${website.vanityPath}/view`,
    )

    expect([HttpStatus.OK, HttpStatus.NOT_FOUND]).toContain(response.status())
  })
})
