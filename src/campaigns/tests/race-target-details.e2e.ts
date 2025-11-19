import { test, expect } from '@playwright/test'
import {
  registerUser,
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  loginUser,
} from '../../../e2e-tests/utils/auth.util'
import { CampaignWithPathToVictory } from '../campaigns.types'

test.describe('Campaigns - Race Target Details', () => {
  const testUsers: Array<{ id: number; token: string }> = []

  test.afterAll(async ({ request }) => {
    for (const { id, token } of testUsers) {
      await deleteUser(request, id, token)
    }
  })

  test('should set campaign office and update race target details', async ({
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

    testUsers.push({
      id: registerResponse.user.id,
      token: registerResponse.token,
    })

    const updateResponse = await request.put('/v1/campaigns/mine', {
      headers: {
        Authorization: `Bearer ${registerResponse.token}`,
      },
      data: {
        details: {
          office: 'Other',
          otherOffice: 'Creola City Mayor',
          state: 'GA',
          electionDate: '2025-11-03',
          positionId: 'Z2lkOi8vYmFsbG90LWZhY3RvcnkvUG9zaXRpb24vNDYyMTM=',
        },
      },
    })

    expect(updateResponse.status()).toBe(200)
  })

  test('should update race target details for current user or fail with external API error', async ({
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

    testUsers.push({
      id: registerResponse.user.id,
      token: registerResponse.token,
    })

    await request.put('/v1/campaigns/mine', {
      headers: {
        Authorization: `Bearer ${registerResponse.token}`,
      },
      data: {
        details: {
          office: 'Other',
          otherOffice: 'Creola City Mayor',
          state: 'GA',
          electionDate: '2025-11-03',
          positionId: 'Z2lkOi8vYmFsbG90LWZhY3RvcnkvUG9zaXRpb24vNDYyMTM=',
        },
      },
    })

    const response = await request.put(
      '/v1/campaigns/mine/race-target-details',
      {
        headers: {
          Authorization: `Bearer ${registerResponse.token}`,
        },
      },
    )

    expect([200, 404, 502]).toContain(response.status())

    if (response.status() === 200) {
      const campaign = (await response.json()) as CampaignWithPathToVictory
      expect(campaign.pathToVictory).toBeTruthy()
      expect(campaign.pathToVictory).toHaveProperty('id')
      expect(campaign.pathToVictory).toHaveProperty('data')

      const { data } = campaign.pathToVictory!
      expect(data?.source).toBeTruthy()
      expect(data?.p2vStatus).toBeTruthy()
      expect(data?.winNumber).toBeGreaterThan(0)
      expect(data?.districtId).toBeTruthy()
      expect(data?.electionType).toBeTruthy()
      expect(data?.electionLocation).toBeTruthy()
      expect(data?.projectedTurnout).toBeGreaterThan(0)
      expect(data?.voterContactGoal).toBeGreaterThan(0)
      expect(data?.p2vCompleteDate).toBeTruthy()
      expect(data?.districtManuallySet).toBe(false)
    }
  })

  test('should manually set L2District or fail with external API error', async ({
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

    testUsers.push({
      id: registerResponse.user.id,
      token: registerResponse.token,
    })

    await request.put('/v1/campaigns/mine', {
      headers: {
        Authorization: `Bearer ${registerResponse.token}`,
      },
      data: {
        details: {
          office: 'Other',
          otherOffice: 'Creola City Mayor',
          state: 'GA',
          electionDate: '2025-11-03',
          positionId: 'Z2lkOi8vYmFsbG90LWZhY3RvcnkvUG9zaXRpb24vNDYyMTM=',
        },
      },
    })

    const response = await request.put('/v1/campaigns/mine/district', {
      headers: {
        Authorization: `Bearer ${registerResponse.token}`,
      },
      data: {
        L2DistrictType: 'Town_District',
        L2DistrictName: 'CREOLOA TOWN',
      },
    })

    expect([200, 500, 502]).toContain(response.status())

    if (response.status() === 200) {
      const campaign = (await response.json()) as CampaignWithPathToVictory
      expect(campaign).toHaveProperty('id')
      expect(campaign).toHaveProperty('details')
      expect(campaign).toHaveProperty('pathToVictory')

      const { pathToVictory } = campaign
      expect(pathToVictory).toHaveProperty('data')
      expect(pathToVictory?.data?.projectedTurnout).toBeGreaterThan(0)
      expect(pathToVictory?.data?.voterContactGoal).toBeGreaterThan(0)
      expect(pathToVictory?.data?.winNumber).toBeGreaterThan(0)
    }
  })
})

test.describe('Campaigns - Race Target Details (Admin)', () => {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  const testUsers: Array<{ id: number; token: string }> = []
  let testSlug: string

  test.beforeAll(() => {
    test.skip(!adminEmail || !adminPassword, 'Admin credentials not configured')
  })

  test.afterAll(async ({ request }) => {
    for (const { id, token } of testUsers) {
      await deleteUser(request, id, token)
    }
  })

  test('should deny non-admin access to admin endpoint', async ({
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

    testUsers.push({
      id: registerResponse.user.id,
      token: registerResponse.token,
    })
    testSlug = registerResponse.campaign.slug

    await request.put('/v1/campaigns/mine', {
      headers: {
        Authorization: `Bearer ${registerResponse.token}`,
      },
      data: {
        details: {
          office: 'Other',
          otherOffice: 'Creola City Mayor',
          state: 'GA',
          electionDate: '2025-11-03',
          positionId: 'Z2lkOi8vYmFsbG90LWZhY3RvcnkvUG9zaXRpb24vNDYyMTM=',
        },
      },
    })

    const response = await request.put(
      `/v1/campaigns/admin/${testSlug}/race-target-details`,
      {
        headers: {
          Authorization: `Bearer ${registerResponse.token}`,
        },
      },
    )

    expect([401, 403]).toContain(response.status())

    const body = (await response.json()) as {
      message: string
      error: string
      statusCode: number
    }
    expect(body.message).toBeTruthy()
    expect(['Unauthorized', 'Forbidden']).toContain(body.error)
    expect([401, 403]).toContain(body.statusCode)
    expect(body).not.toHaveProperty('pathToVictory')
    expect(body).not.toHaveProperty('campaign')
    expect(body).not.toHaveProperty('data')
  })

  test('should allow admin to update race target details by slug or fail with external API error', async ({
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

    testUsers.push({
      id: registerResponse.user.id,
      token: registerResponse.token,
    })
    testSlug = registerResponse.campaign.slug

    await request.put('/v1/campaigns/mine', {
      headers: {
        Authorization: `Bearer ${registerResponse.token}`,
      },
      data: {
        details: {
          office: 'Other',
          otherOffice: 'Creola City Mayor',
          state: 'GA',
          electionDate: '2025-11-03',
          positionId: 'Z2lkOi8vYmFsbG90LWZhY3RvcnkvUG9zaXRpb24vNDYyMTM=',
        },
      },
    })

    const { token: adminToken } = await loginUser(
      request,
      adminEmail!,
      adminPassword!,
    )

    const response = await request.put(
      `/v1/campaigns/admin/${testSlug}/race-target-details`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    )

    expect([200, 404, 502]).toContain(response.status())

    if (response.status() === 200) {
      const campaign = (await response.json()) as CampaignWithPathToVictory
      expect(campaign.pathToVictory).toBeTruthy()
      expect(campaign.pathToVictory?.data).toBeTruthy()
      expect(campaign.pathToVictory?.data?.winNumber).toBeGreaterThan(0)
      expect(campaign.pathToVictory?.data?.projectedTurnout).toBeGreaterThan(0)
      expect(campaign.pathToVictory?.data?.voterContactGoal).toBeGreaterThan(0)
    }
  })

  test('should allow admin to update race target details with excludeTurnout or fail with external API error', async ({
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

    testUsers.push({
      id: registerResponse.user.id,
      token: registerResponse.token,
    })
    testSlug = registerResponse.campaign.slug

    await request.put('/v1/campaigns/mine', {
      headers: {
        Authorization: `Bearer ${registerResponse.token}`,
      },
      data: {
        details: {
          office: 'Other',
          otherOffice: 'Creola City Mayor',
          state: 'GA',
          electionDate: '2025-11-03',
          positionId: 'Z2lkOi8vYmFsbG90LWZhY3RvcnkvUG9zaXRpb24vNDYyMTM=',
        },
      },
    })

    const { token: adminToken } = await loginUser(
      request,
      adminEmail!,
      adminPassword!,
    )

    const response = await request.put(
      `/v1/campaigns/admin/${testSlug}/race-target-details?includeTurnout=false`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    )

    expect([200, 404, 502]).toContain(response.status())

    if (response.status() === 200) {
      const campaign = (await response.json()) as CampaignWithPathToVictory
      expect(campaign.pathToVictory).toBeTruthy()
      expect(campaign.pathToVictory?.data).toBeTruthy()
      expect(campaign.pathToVictory?.data?.winNumber).toBeGreaterThan(0)
      expect(campaign.pathToVictory?.data?.projectedTurnout).toBeGreaterThan(0)
      expect(campaign.pathToVictory?.data?.voterContactGoal).toBeGreaterThan(0)
    }
  })
})
