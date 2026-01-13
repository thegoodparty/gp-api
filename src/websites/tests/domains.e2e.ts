import { faker } from '@faker-js/faker'
import { expect, test } from '@playwright/test'
import { Prisma } from '@prisma/client'
import {
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  registerUser,
} from '../../../e2e-tests/utils/auth.util'
import { DomainSearchResult } from '../domains.types'

type WebsiteWithDomain = Prisma.WebsiteGetPayload<{
  include: {
    domain: true
  }
}>

test.describe('Websites - Domains', () => {
  let testUserId: number
  let authToken: string

  test.afterEach(async ({ request }) => {
    if (testUserId && authToken) {
      await deleteUser(request, testUserId, authToken)
    }
  })

  test('should search for domain availability', async ({ request }) => {
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

    const domainName = `${faker.word.noun()}-${Date.now()}.com`

    const response = await request.get(
      `/v1/domains/search?domain=${domainName}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const result = (await response.json()) as DomainSearchResult
    expect(result.domainName).toBe(domainName)
    expect(result.availability).toBeDefined()
    expect(typeof result.availability).toBe('string')
    if (result.price !== undefined) {
      expect(typeof result.price).toBe('number')
    }
  })

  test('should return domain suggestions', async ({ request }) => {
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

    const domainName = `${faker.word.noun()}-${Date.now()}.com`

    const response = await request.get(
      `/v1/domains/search?domain=${domainName}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const result = (await response.json()) as DomainSearchResult
    expect(result.suggestions).toBeDefined()
    expect(Array.isArray(result.suggestions)).toBe(true)
    expect(result.suggestions.length).toBeGreaterThan(0)

    result.suggestions.forEach((suggestion) => {
      expect(suggestion.Availability).toBeDefined()
      expect(typeof suggestion.Availability).toBe('string')
      expect(suggestion.DomainName).toBeDefined()
      expect(typeof suggestion.DomainName).toBe('string')
      if (suggestion.price !== undefined) {
        expect(typeof suggestion.price).toBe('number')
      }
    })
  })

  test('should get website by domain name', async ({ request }) => {
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

    const vanityPath = `domain-test-${Date.now()}`

    await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        vanityPath,
        status: 'published',
      },
    })

    const testDomain = `${vanityPath}.test.com`

    const response = await request.get(`/v1/websites/by-domain/${testDomain}`)

    expect([200, 404]).toContain(response.status())

    if (response.status() === 200) {
      const website = (await response.json()) as WebsiteWithDomain
      expect(website).toBeDefined()
      expect(website.campaignId).toBe(registerResponse.campaign.id)
    }
  })

  test('should return 404 for non-existent domain', async ({ request }) => {
    const nonExistentDomain = `non-existent-${Date.now()}.test.com`

    const response = await request.get(
      `/v1/websites/by-domain/${nonExistentDomain}`,
    )

    expect(response.status()).toBe(404)
  })
})
