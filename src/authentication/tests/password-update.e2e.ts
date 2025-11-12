import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  generateRandomEmail,
  generateRandomName,
  cleanupTestUser,
  LoginResponse,
} from '../../../e2e-tests/utils/auth.util'
import { TestInfoWithContext } from '../../../e2e-tests/utils/test-context.types'

test.describe('Authentication - Password Update', () => {
  const initialPassword = 'initialPassword123'

  test.beforeEach(async ({ request }, testInfo) => {
    const testUserEmail = generateRandomEmail()
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
    ;(testInfo as TestInfoWithContext).testContext = {
      testUser: {
        userId: result.user.id,
        authToken: result.token,
      },
      testUserEmail,
    }
  })

  test.afterEach(async ({ request }, testInfo) => {
    const testContext = (testInfo as TestInfoWithContext).testContext

    if (testContext) {
      await cleanupTestUser(request, testContext.testUser)
    }
  })

  test('should update user password', async ({ request }, testInfo) => {
    const testContext = (testInfo as TestInfoWithContext).testContext!
    const newPassword = 'updatedPassword456'

    const response = await request.put(
      `/v1/users/${testContext.testUser.userId}/password`,
      {
        headers: {
          Authorization: `Bearer ${testContext.testUser.authToken}`,
        },
        data: {
          oldPassword: initialPassword,
          newPassword: newPassword,
        },
      },
    )

    expect(response.status()).toBe(HttpStatus.OK)
  })

  test('should login with updated password', async ({ request }, testInfo) => {
    const testContext = (testInfo as TestInfoWithContext).testContext!
    const newPassword = 'updatedPassword456'

    await request.put(`/v1/users/${testContext.testUser.userId}/password`, {
      headers: {
        Authorization: `Bearer ${testContext.testUser.authToken}`,
      },
      data: {
        oldPassword: initialPassword,
        newPassword: newPassword,
      },
    })

    const loginResponse = await request.post('/v1/authentication/login', {
      data: {
        email: testContext.testUserEmail,
        password: newPassword,
      },
    })

    expect(loginResponse.status()).toBe(HttpStatus.CREATED)

    const body = (await loginResponse.json()) as LoginResponse
    expect(body.token).toBeTruthy()
    expect(body.user.email).toBe(testContext.testUserEmail)
    expect(body.user.password).toBeUndefined()
    expect(body.user.hasPassword).toBe(true)

    testContext.testUser.authToken = body.token
  })
})
