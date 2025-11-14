import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  loginUser,
  registerUser,
  cleanupTestUser,
  generateRandomEmail,
  generateRandomName,
} from '../../../e2e-tests/utils/auth.util'
import { TestInfoWithContext } from '../../../e2e-tests/utils/test-context.types'

test.describe('Admin - Campaign Management', () => {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  test.beforeAll(() => {
    test.skip(!adminEmail || !adminPassword, 'Admin credentials not configured')
  })

  test.beforeEach(async ({ request }, testInfo) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)
    ;(testInfo as TestInfoWithContext).testContext = {
      adminToken: token,
    }
  })

  test.afterEach(async ({ request }, testInfo) => {
    const testContext = (testInfo as TestInfoWithContext).testContext

    if (testContext?.testUser) {
      await cleanupTestUser(request, testContext.testUser)
    }
  })

  test('should create a campaign as admin', async ({ request }, testInfo) => {
    const testContext = (testInfo as TestInfoWithContext).testContext!
    const email = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()

    const response = await request.post('/v1/admin/campaigns', {
      headers: {
        Authorization: `Bearer ${testContext.adminToken}`,
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

    expect(response.status()).toBe(HttpStatus.CREATED)

    const campaign = (await response.json()) as {
      id: number
      slug: string
      userId: number
    }
    expect(campaign).toHaveProperty('id')
    expect(campaign).toHaveProperty('slug')

    testContext.testUser = {
      userId: campaign.userId,
      authToken: testContext.adminToken!,
    }
  })

  test('should update a campaign as admin', async ({ request }, testInfo) => {
    const testContext = (testInfo as TestInfoWithContext).testContext!
    const registerResponse = await registerUser(request, {
      firstName: generateRandomName(),
      lastName: generateRandomName(),
      email: generateRandomEmail(),
      password: 'password123',
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    testContext.testUser = {
      userId: registerResponse.user.id,
      authToken: registerResponse.token,
    }

    const campaignId = registerResponse.campaign.id

    const updateResponse = await request.put(
      `/v1/admin/campaigns/${campaignId}`,
      {
        headers: {
          Authorization: `Bearer ${testContext.adminToken}`,
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
})
