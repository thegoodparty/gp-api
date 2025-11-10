import { test, expect } from '@playwright/test'
import { loginUser } from '../../utils/auth.util'

test.describe('Authentication - Set Password Email', () => {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  const candidateId = process.env.CANDIDATE_ID
    ? Number(process.env.CANDIDATE_ID)
    : undefined

  const hasCredentials = !!(adminEmail && adminPassword && candidateId)

  test('should send set password email as admin', async ({ request }) => {
    test.skip(!hasCredentials, 'Credentials not configured in .env')

    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const response = await request.post(
      '/v1/authentication/send-set-password-email',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: {
          userId: candidateId!,
        },
      },
    )

    expect(response.status()).toBe(200)

    const body = (await response.json()) as { token: string }
    expect(body.token).toBeTruthy()
  })
})
