import { faker } from '@faker-js/faker'
import { expect, test } from '@playwright/test'
import { WebsiteView } from '@prisma/client'
import {
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  registerUser,
} from '../../../e2e-tests/utils/auth.util'

test.describe('Websites - Views', () => {
  let testUserId: number | undefined
  let authToken: string | undefined

  test.afterEach(async ({ request }) => {
    if (testUserId && authToken) {
      await deleteUser(request, testUserId, authToken)
      testUserId = undefined
      authToken = undefined
    }
  })

  test('should track website view', async ({ request }) => {
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

    const vanityPath = `track-view-${Date.now()}`

    await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        vanityPath,
        status: 'published',
      },
    })

    const visitorId = faker.string.uuid()

    const response = await request.post(
      `/v1/websites/${vanityPath}/track-view`,
      {
        data: {
          visitorId,
        },
      },
    )

    expect(response.status()).toBe(201)

    const view = (await response.json()) as WebsiteView
    expect(view.visitorId).toBe(visitorId)
    expect(view.websiteId).toBeDefined()
  })

  test('should track multiple views from different visitors', async ({
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

    const vanityPath = `multi-views-${Date.now()}`

    await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        vanityPath,
        status: 'published',
      },
    })

    const visitorIds = [
      faker.string.uuid(),
      faker.string.uuid(),
      faker.string.uuid(),
    ]

    for (const visitorId of visitorIds) {
      const response = await request.post(
        `/v1/websites/${vanityPath}/track-view`,
        {
          data: {
            visitorId,
          },
        },
      )
      expect(response.status()).toBe(201)
    }

    const viewsResponse = await request.get('/v1/websites/mine/views', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(viewsResponse.status()).toBe(200)

    const views = (await viewsResponse.json()) as WebsiteView[]
    expect(views.length).toBeGreaterThanOrEqual(3)
  })

  test('should get website views within date range', async ({ request }) => {
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

    const vanityPath = `date-range-views-${Date.now()}`

    await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        vanityPath,
        status: 'published',
      },
    })

    await request.post(`/v1/websites/${vanityPath}/track-view`, {
      data: {
        visitorId: faker.string.uuid(),
      },
    })

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + 1)

    const response = await request.get(
      `/v1/websites/mine/views?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const views = (await response.json()) as WebsiteView[]
    expect(Array.isArray(views)).toBe(true)

    views.forEach((view) => {
      const createdAt = new Date(view.createdAt)
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(startDate.getTime())
      expect(createdAt.getTime()).toBeLessThan(endDate.getTime())
    })
  })

  test('should return empty array for views outside date range', async ({
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

    const vanityPath = `empty-views-${Date.now()}`

    await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        vanityPath,
        status: 'published',
      },
    })

    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 2)
    const endDate = new Date()
    endDate.setFullYear(endDate.getFullYear() - 1)

    const response = await request.get(
      `/v1/websites/mine/views?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const views = (await response.json()) as WebsiteView[]
    expect(Array.isArray(views)).toBe(true)
    expect(views.length).toBe(0)
  })

  test('should return 401 when getting views without auth', async ({
    request,
  }) => {
    const response = await request.get('/v1/websites/mine/views')

    expect(response.status()).toBe(401)
  })
})
