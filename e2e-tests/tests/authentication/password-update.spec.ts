import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  generateRandomEmail,
  generateRandomName,
  cleanupTestUser,
  TestUser,
  LoginResponse,
} from '../../utils/auth.util'

test.describe('Authentication - Password Update', () => {
  let testUserCleanup: TestUser | null = null
  let testUserEmail: string
  const initialPassword = 'initialPassword123'

  test.beforeEach(async ({ request }) => {
    testUserEmail = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const result = await registerUser(request, {
      firstName,
      lastName,
      email: testUserEmail,
      password: initialPassword,
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

  test('should update user password', async ({ request }) => {
    if (!testUserCleanup) throw new Error('Test setup failed')
    const newPassword = 'updatedPassword456'

    const response = await request.put(
      `/v1/users/${testUserCleanup.userId}/password`,
      {
        headers: {
          Authorization: `Bearer ${testUserCleanup.authToken}`,
        },
        data: {
          oldPassword: initialPassword,
          newPassword: newPassword,
        },
      },
    )

    expect(response.status()).toBe(HttpStatus.OK)
  })

  test('should login with updated password', async ({ request }) => {
    if (!testUserCleanup) throw new Error('Test setup failed')
    const newPassword = 'updatedPassword456'

    await request.put(`/v1/users/${testUserCleanup.userId}/password`, {
      headers: {
        Authorization: `Bearer ${testUserCleanup.authToken}`,
      },
      data: {
        oldPassword: initialPassword,
        newPassword: newPassword,
      },
    })

    const loginResponse = await request.post('/v1/authentication/login', {
      data: {
        email: testUserEmail,
        password: newPassword,
      },
    })

    expect(loginResponse.status()).toBe(HttpStatus.CREATED)

    const body = (await loginResponse.json()) as LoginResponse
    expect(body.token).toBeTruthy()
    expect(body.user.email).toBe(testUserEmail)
    expect(body.user.password).toBeUndefined()
    expect(body.user.hasPassword).toBe(true)

    testUserCleanup.authToken = body.token
  })
})
