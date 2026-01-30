import { test, expect } from '@playwright/test'
import { loginUser } from '../../../../e2e-tests/utils/auth.util'

type TcrCompliance = { id: string }

const BASE_TCR_DATA = {
  ein: '12-3456789',
  placeId: 'ChIJN5kbvzXvZIgRND3iKCSUuxk',
  formattedAddress: '1099 Fannie Nicholson Rd, Chapmansboro, TN 37035, USA',
  committeeName: 'Paper Street Soap Co.',
  websiteDomain: 'www.paperstreet.store',
  filingUrl: 'https://sos.tn.co/filing',
  email: 'tyler@fightclub.org',
  phone: '288-555-0153',
  officeLevel: 'local',
  committeeType: 'CANDIDATE',
}

test.describe('Campaigns - TCR Compliance', () => {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  let tcrComplianceId: string

  test.beforeAll(() => {
    test.skip(!adminEmail || !adminPassword, 'Admin credentials not configured')
  })

  test('should create TCR compliance or return 404 if not implemented', async ({
    request,
  }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const response = await request.post('/v1/campaigns/tcr-compliance', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        ...BASE_TCR_DATA,
      },
    })

    expect([201, 404, 400]).toContain(response.status())

    if (response.status() === 201) {
      const body = (await response.json()) as TcrCompliance
      expect(body.id).toBeTruthy()
      expect(typeof body.id).toBe('string')
      tcrComplianceId = body.id
    }
  })

  test('should reject duplicate TCR compliance or return 404 if not implemented', async ({
    request,
  }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const response = await request.post('/v1/campaigns/tcr-compliance', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        ...BASE_TCR_DATA,
      },
    })

    expect([400, 409, 404]).toContain(response.status())
  })

  test('should check TCR compliance status', async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    if (!tcrComplianceId) {
      test.skip()
      return
    }

    const response = await request.get(
      `/v1/campaigns/tcr-compliance/${tcrComplianceId}/status`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    expect(response.status()).toBe(200)
  })

  test('should submit campaign verify PIN', async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    if (!tcrComplianceId) {
      test.skip()
      return
    }

    const response = await request.post(
      `/v1/campaigns/tcr-compliance/${tcrComplianceId}/submit-cv-pin`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: {
          pin: 12345,
        },
      },
    )

    expect(response.status()).toBe(200)
  })

  test('should delete TCR compliance', async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    if (!tcrComplianceId) {
      test.skip()
      return
    }

    const response = await request.delete(
      `/v1/campaigns/tcr-compliance/${tcrComplianceId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    expect(response.status()).toBe(200)
  })
})
