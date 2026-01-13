import { HttpStatus } from '@nestjs/common'
import { expect, test } from '@playwright/test'
import { loginUser } from '../../../e2e-tests/utils/auth.util'

test.describe('Viability', () => {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  test.beforeAll(() => {
    test.skip(!adminEmail || !adminPassword, 'Admin credentials not configured')
  })

  let authToken: string

  test.beforeEach(async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)
    authToken = token
  })

  test('should calculate viability score for a campaign', async ({
    request,
  }) => {
    const candidateResponse = await loginUser(
      request,
      process.env.CANDIDATE_EMAIL || '',
      process.env.CANDIDATE_PASSWORD || '',
    )

    if (!candidateResponse.campaign?.id) {
      test.skip()
      return
    }

    const campaignId = candidateResponse.campaign.id

    const response = await request.get(`/v1/path-to-victory/${campaignId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const body = (await response.json()) as {
      success: boolean
      message: string
    }
    expect(body).toHaveProperty('success')
    expect(body).toHaveProperty('message')
    expect(body.success).toBe(true)
    expect(body.message).toContain('Path to victory calculation for campaign')
  })
})
