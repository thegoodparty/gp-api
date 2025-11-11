import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  deleteUser,
  generateRandomEmail,
  generateRandomName,
} from '../../utils/auth.util'

test.describe('Authentication - Password Reset', () => {
  let testUserId: number
  let testUserEmail: string
  let authToken: string

  test.beforeEach(async ({ request }) => {
    testUserEmail = generateRandomEmail()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const firstName: string = generateRandomName()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const lastName: string = generateRandomName()
    const result = await registerUser(request, {
      firstName,
      lastName,
      email: testUserEmail,
      password: 'initialPassword123',
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })
    testUserId = result.user.id
    authToken = result.token
  })

  test.afterEach(async ({ request }) => {
    if (testUserId && authToken) {
      await deleteUser(request, testUserId, authToken)
    }
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
