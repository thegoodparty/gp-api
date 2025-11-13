import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  loginUser,
  registerUser,
  deleteUser,
  generateRandomEmail,
  generateRandomName,
} from '../../../e2e-tests/utils/auth.util'

test.describe('Admin - Campaign Management', () => {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  test.beforeAll(() => {
    test.skip(!adminEmail || !adminPassword, 'Admin credentials not configured')
  })

  let adminToken: string
  let testUserId: number | undefined
  let testAuthToken: string | undefined

  test.afterEach(async ({ request }) => {
    if (testUserId && testAuthToken) {
      await deleteUser(request, testUserId, testAuthToken)
      testUserId = undefined
      testAuthToken = undefined
    }
  })

  test.beforeEach(async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)
    adminToken = token
  })

  test('should create a campaign as admin', async ({ request }) => {
    const email = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()

    const response = await request.post('/v1/admin/campaigns', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      data: {
        email,
        firstName,
        lastName,
        phone: '5555555555',
        zip: '12345-1234',
        party: 'Independent',
        adminUserEmail: adminEmail,
      },
    })

    if (!response.ok()) {
      console.log('Request failed:', await response.text())
    }

    expect(response.status()).toBe(HttpStatus.CREATED)

    const campaign = (await response.json()) as {
      id: number
      slug: string
      userId: number
    }
    expect(campaign).toHaveProperty('id')
    expect(campaign).toHaveProperty('slug')

    testUserId = campaign.userId
    testAuthToken = adminToken
  })

  test('should update a campaign as admin', async ({ request }) => {
    const registerResponse = await registerUser(request, {
      firstName: generateRandomName(),
      lastName: generateRandomName(),
      email: generateRandomEmail(),
      password: 'password123',
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    testUserId = registerResponse.user.id
    testAuthToken = registerResponse.token

    const campaignId = registerResponse.campaign.id

    const updateResponse = await request.put(
      `/v1/admin/campaigns/${campaignId}`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        data: {
          isVerified: true,
        },
      },
    )

    expect(updateResponse.status()).toBe(HttpStatus.OK)

    const updatedCampaign = (await updateResponse.json()) as { id: number }
    expect(updatedCampaign.id).toBe(campaignId)
  })

  test.skip('should delete a campaign as admin', async ({ request }) => {
    const registerResponse = await registerUser(request, {
      firstName: generateRandomName(),
      lastName: generateRandomName(),
      email: generateRandomEmail(),
      password: 'password123',
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    const campaignId = registerResponse.campaign.id

    const deleteResponse = await request.delete(
      `/v1/admin/campaigns/${campaignId}`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    )

    expect(deleteResponse.status()).toBe(HttpStatus.NO_CONTENT)

    await deleteUser(request, registerResponse.user.id, registerResponse.token)
  })
})
