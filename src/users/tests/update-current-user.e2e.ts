import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  cleanupTestUser,
} from '../../../e2e-tests/utils/auth.util'
import { type ReadUserOutput } from '@goodparty_org/contracts'
import { TestInfoWithContext } from '../../../e2e-tests/utils/test-context.types'

test.describe('Users - Update Current User', () => {
  test.afterEach(async ({ request }, testInfo) => {
    const testContext = (testInfo as TestInfoWithContext).testContext

    if (testContext) {
      await cleanupTestUser(request, testContext.testUser)
    }
  })

  test('should update current user', async ({ request }, testInfo) => {
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

    const newFirstName = generateRandomName()
    const newLastName = generateRandomName()

    const response = await request.put('/v1/users/me', {
      headers: {
        Authorization: `Bearer ${(testInfo as TestInfoWithContext).testContext!.testUser!.authToken}`,
      },
      data: {
        firstName: newFirstName,
        lastName: newLastName,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const body = (await response.json()) as ReadUserOutput
    expect(body.firstName).toBe(newFirstName)
    expect(body.lastName).toBe(newLastName)
    expect(body.email).toBe(email)
  })

  test('should return 401 when not authenticated', async ({ request }) => {
    const response = await request.put('/v1/users/me', {
      data: {
        firstName: 'New',
        lastName: 'Name',
      },
    })

    expect(response.status()).toBe(HttpStatus.UNAUTHORIZED)
  })
})
