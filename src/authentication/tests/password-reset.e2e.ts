import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  generateRandomEmail,
  generateRandomName,
  cleanupTestUser,
  TestUser,
} from '../../../e2e-tests/utils/auth.util'

interface TestContext {
  testUser: TestUser
  testUserEmail: string
}

test.describe('Authentication - Password Reset', () => {
  test.beforeEach(async ({ request }, testInfo) => {
    const testUserEmail = generateRandomEmail()
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

    const testContext: TestContext = {
      testUser: {
        userId: result.user.id,
        authToken: result.token,
      },
      testUserEmail,
    }

    testInfo.annotations.push({
      type: 'testContext',
      description: JSON.stringify(testContext),
    })
  })

  test.afterEach(async ({ request }, testInfo) => {
    const contextAnnotation = testInfo.annotations.find(
      (annotation) => annotation.type === 'testContext',
    )

    if (contextAnnotation?.description) {
      const testContext: TestContext = JSON.parse(
        contextAnnotation.description,
      ) as TestContext
      await cleanupTestUser(request, testContext.testUser)
    }
  })

  test('should send recover password email', async ({ request }, testInfo) => {
    const contextAnnotation = testInfo.annotations.find(
      (annotation) => annotation.type === 'testContext',
    )
    const testContext: TestContext = JSON.parse(
      contextAnnotation!.description!,
    ) as TestContext

    const response = await request.post(
      '/v1/authentication/send-recover-password-email',
      {
        data: {
          email: testContext.testUserEmail,
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

  test('should return 403 for invalid reset token', async ({
    request,
  }, testInfo) => {
    const contextAnnotation = testInfo.annotations.find(
      (annotation) => annotation.type === 'testContext',
    )
    const testContext: TestContext = JSON.parse(
      contextAnnotation!.description!,
    ) as TestContext

    const response = await request.post('/v1/authentication/reset-password', {
      data: {
        email: testContext.testUserEmail,
        password: 'newPassword123',
        token: 'notgood',
      },
    })

    expect(response.status()).toBe(HttpStatus.FORBIDDEN)
  })
})
