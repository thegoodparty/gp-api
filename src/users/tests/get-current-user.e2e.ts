import { HttpStatus } from '@nestjs/common'
import { expect, test } from '@playwright/test'
import {
  cleanupTestUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  registerUser,
} from '../../../e2e-tests/utils/auth.util'
import { TestInfoWithContext } from '../../../e2e-tests/utils/test-context.types'
import { ReadUserOutput } from '../schemas/ReadUserOutput.schema'

test.describe('Users - Get Current User', () => {
  test.afterEach(async ({ request }, testInfo) => {
    const testContext = (testInfo as TestInfoWithContext).testContext

    if (testContext) {
      await cleanupTestUser(request, testContext.testUser)
    }
  })

  test('should get currently authenticated user', async ({
    request,
  }, testInfo) => {
    const email = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const password = generateRandomPassword()

    const registerResponse = await registerUser(request, {
      firstName,
      lastName,
      email,
      password,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    ;(testInfo as TestInfoWithContext).testContext = {
      testUser: {
        userId: registerResponse.user.id,
        authToken: registerResponse.token,
      },
    }

    const { userId: testUserId, authToken } = (testInfo as TestInfoWithContext)
      .testContext!.testUser!

    const response = await request.get('/v1/users/me', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const body = (await response.json()) as ReadUserOutput
    expect(body.id).toBe(testUserId)
    expect(body.email).toBe(email)
    expect(body.firstName).toBe(firstName)
    expect(body.lastName).toBe(lastName)
    expect('password' in body).toBe(false)
  })

  test('should return 401 when not authenticated', async ({ request }) => {
    const response = await request.get('/v1/users/me')

    expect(response.status()).toBe(HttpStatus.UNAUTHORIZED)
  })
})
