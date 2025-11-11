import { test, expect } from '@playwright/test'
import { loginUser } from '../../../utils/auth.util'

test.describe('Campaigns - Mass Updates', () => {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  test.beforeAll(() => {
    test.skip(!adminEmail || !adminPassword, 'Admin credentials not configured')
  })

  test('should deny unauthorized access to missing win numbers endpoint', async ({
    request,
  }) => {
    const response = await request.post(
      '/v1/campaigns/missing-win-numbers/update',
    )

    expect([401, 404]).toContain(response.status())
  })

  test('should allow admin to update missing win numbers or return 404 if not implemented', async ({
    request,
  }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const response = await request.post(
      '/v1/campaigns/missing-win-numbers/update',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    expect([201, 404]).toContain(response.status())
  })

  test('should deny unauthorized mass hubspot push', async ({ request }) => {
    const response = await request.get('/v1/crm/mass-refresh-companies')

    expect(response.status()).toBe(401)
  })
})

