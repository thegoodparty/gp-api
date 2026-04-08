import { expect, test } from '@playwright/test'
import {
  authHeaders,
  campaignOrgSlug,
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  registerUser,
  RegisterResponse,
} from '../../../e2e-tests/utils/auth.util'
import {
  assertResponseOk,
  retryOnConflict,
  updateCampaignWithRetry,
} from '../../../e2e-tests/utils/request.util'

/** BallotReady ID shared with race-target-details / contacts e2e for election-api lookups */
const E2E_BALLOT_READY_POSITION_ID =
  'Z2lkOi8vYmFsbG90LWZhY3RvcnkvUG9zaXRpb24vNDYyMTM='

test.describe('Campaigns - User Campaign Operations', () => {
  let reg: RegisterResponse
  let orgSlug: string

  test.beforeAll(async ({ request }) => {
    reg = await registerUser(request, {
      firstName: generateRandomName(),
      lastName: generateRandomName(),
      email: generateRandomEmail(),
      password: generateRandomPassword(),
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })
    orgSlug = campaignOrgSlug(reg.campaign.id)
  })

  test.afterAll(async ({ request }) => {
    if (reg?.user?.id && reg?.token) {
      await deleteUser(request, reg.user.id, reg.token)
    }
  })

  test('should get campaign status for logged in user', async ({ request }) => {
    const response = await request.get('/v1/campaigns/mine/status', {
      headers: authHeaders(reg.token, orgSlug),
    })

    expect(response.status()).toBe(200)

    const body = (await response.json()) as { status: string; slug: string }
    expect(body).toHaveProperty('status')
    expect(body).toHaveProperty('slug')
    expect(typeof body.status).toBe('string')
    expect(typeof body.slug).toBe('string')
  })

  test('should get logged in user campaign', async ({ request }) => {
    const response = await request.get('/v1/campaigns/mine', {
      headers: authHeaders(reg.token, orgSlug),
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
    const response = await request.get('/v1/campaigns/mine/plan-version', {
      headers: authHeaders(reg.token, orgSlug),
    })

    expect([200, 404]).toContain(response.status())
  })

  test('should update campaign', async ({ request }) => {
    const randomName = generateRandomName()
    const randomWebsite = `https://${Math.random().toString(36).substring(7)}.com`

    const response = await updateCampaignWithRetry(
      request,
      reg.token,
      {
        data: {
          name: randomName,
        },
        details: {
          website: randomWebsite,
        },
      },
      orgSlug,
    )

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
    const response = await request.put('/v1/campaigns/mine', {
      headers: authHeaders(reg.token, orgSlug),
      data: {
        details: {
          website: ['array'],
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

  test('should launch campaign', async ({ request }) => {
    const patchOrgRes = await request.patch(
      `/v1/organizations/${orgSlug}`,
      {
        headers: authHeaders(reg.token, orgSlug),
        data: { ballotReadyPositionId: E2E_BALLOT_READY_POSITION_ID },
      },
    )
    await assertResponseOk(patchOrgRes, 'Org position update failed')

    const response = await retryOnConflict(() =>
      request.post('/v1/campaigns/launch', {
        headers: authHeaders(reg.token, orgSlug),
      }),
    )

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
      data: {
        details: { zip: '12345-1234' },
      },
    })

    expect(response.status()).toBe(409)

    const body = (await response.json()) as { message: string }
    expect(body.message).toBe('User campaign already exists.')
  })
})
