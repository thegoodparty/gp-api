import { expect, test } from '@playwright/test'
import {
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  loginUser,
  registerUser,
} from '../../../e2e-tests/utils/auth.util'

test.describe('Campaigns - User Campaign Operations', () => {
  const candidateEmail = process.env.CANDIDATE_EMAIL
  const candidatePassword = process.env.CANDIDATE_PASSWORD

  test.beforeAll(() => {
    test.skip(
      !candidateEmail || !candidatePassword,
      'Candidate credentials not configured',
    )
  })

  test('should get campaign status for logged in user', async ({ request }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    const response = await request.get('/v1/campaigns/mine/status', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(response.status()).toBe(200)

    const body = (await response.json()) as { status: string; slug: string }
    expect(body).toHaveProperty('status')
    expect(body).toHaveProperty('slug')
    expect(typeof body.status).toBe('string')
    expect(typeof body.slug).toBe('string')
  })

  test('should get logged in user campaign', async ({ request }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    const response = await request.get('/v1/campaigns/mine', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(response.status()).toBe(200)

    const campaign = (await response.json()) as {
      id: number
      slug: string
      data: Record<string, string | number | boolean>
      details: Record<string, string | number | boolean>
    }
    expect(campaign).toHaveProperty('id')
    expect(campaign).toHaveProperty('slug')
    expect(campaign).toHaveProperty('data')
    expect(campaign).toHaveProperty('details')
  })

  test('should get campaign plan version or 404 if not found', async ({
    request,
  }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    const response = await request.get('/v1/campaigns/mine/plan-version', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect([200, 404]).toContain(response.status())
  })

  test('should update campaign', async ({ request }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    const randomName = generateRandomName()
    const randomWebsite = `https://${Math.random().toString(36).substring(7)}.com`

    const response = await request.put('/v1/campaigns/mine', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        data: {
          name: randomName,
        },
        details: {
          website: randomWebsite,
        },
      },
    })

    expect(response.status()).toBe(200)

    const campaign = (await response.json()) as {
      data: { name: string }
      details: { website: string }
    }
    expect(campaign.data.name).toBe(randomName)
    expect(campaign.details.website).toBe(randomWebsite)
  })

  test('should reject invalid field types in campaign update', async ({
    request,
  }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    const response = await request.put('/v1/campaigns/mine', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        details: {
          otherOffice: ['array'],
        },
      },
    })

    expect(response.status()).toBe(400)

    const body = (await response.json()) as {
      message: string
      errors: Array<{ message: string }>
    }
    expect(body.message).toBe('Validation failed')
    expect(body.errors[0].message).toBe('Expected string, received array')
  })

  test('should set campaign office', async ({ request }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    const response = await request.put('/v1/campaigns/mine', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        details: {
          office: 'Other',
          otherOffice: 'State Representative',
        },
      },
    })

    expect(response.status()).toBe(200)
  })

  test('should launch campaign', async ({ request }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    const response = await request.post('/v1/campaigns/launch', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(response.status()).toBe(200)

    const result = (await response.json()) as boolean
    expect(result).toBe(true)
  })
})

test.describe('Campaigns - User Without Campaign', () => {
  let testUserId: number
  let testUserEmail: string
  let testUserToken: string

  test.afterAll(async ({ request }) => {
    if (testUserId && testUserToken) {
      await deleteUser(request, testUserId, testUserToken)
    }
  })

  test('should return conflict when creating duplicate campaign', async ({
    request,
  }) => {
    testUserEmail = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const password = generateRandomPassword()

    const registerResponse = await registerUser(request, {
      firstName,
      lastName,
      email: testUserEmail,
      password,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    testUserId = registerResponse.user.id
    testUserToken = registerResponse.token

    const response = await request.post('/v1/campaigns', {
      headers: {
        Authorization: `Bearer ${testUserToken}`,
      },
    })

    expect(response.status()).toBe(409)

    const body = (await response.json()) as { message: string }
    expect(body.message).toBe('User campaign already exists.')
  })
})
