import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  generateRandomEmail,
  generateRandomName,
  cleanupTestUser,
  TestUser,
} from '../../utils/auth.util'

test.describe('Authentication - Password Reset', () => {
  let testUserCleanup: TestUser | null = null
  let testUserEmail: string

  test.beforeEach(async ({ request }) => {
    testUserEmail = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const result = await registerUser(request, {
      firstName,
      lastName,
      email: testUserEmail,
      password: 'initialPassword123',
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })
    testUserCleanup = {
      userId: result.user.id,
      authToken: result.token,
    }
  })

  test.afterEach(async ({ request }) => {
    await cleanupTestUser(request, testUserCleanup)
    testUserCleanup = null
  })

  test('should send recover password email', async ({ request }) => {
    const response = await request.post(
      '/v1/authentication/send-recover-password-email',
      {
        data: {
          email: testUserEmail,
        },
      },
    )

    expect(response.status()).toBe(HttpStatus.NO_CONTENT)
  })

  test('should return 204 when email not found (security)', async ({
    request,
  }) => {
    const response = await request.post(
      '/v1/authentication/send-recover-password-email',
      {
        data: {
          email: 'somenonsenseemailthatwontexist@fakeplace.nonsense',
        },
      },
    )

    expect(response.status()).toBe(HttpStatus.NO_CONTENT)
  })

  test('should return 403 for invalid reset token', async ({ request }) => {
    const response = await request.post('/v1/authentication/reset-password', {
      data: {
        email: testUserEmail,
        password: 'newPassword123',
        token: 'notgood',
      },
    })

    expect(response.status()).toBe(HttpStatus.FORBIDDEN)
  })
})
