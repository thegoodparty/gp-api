import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
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

    const response = await request.get(`/v1/viability/${campaignId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const body = (await response.json()) as {
      success: boolean
      message: string
      data: unknown
    }
    expect(body).toHaveProperty('success')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('data')
  })
})
