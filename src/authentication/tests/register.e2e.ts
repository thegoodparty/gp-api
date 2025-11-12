import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  cleanupTestUser,
  RegisterResponse,
} from '../../../e2e-tests/utils/auth.util'
import { TestInfoWithContext } from '../../../e2e-tests/utils/test-context.types'

test.describe('Authentication - Register', () => {
  test.afterEach(async ({ request }, testInfo) => {
    const testContext = (testInfo as TestInfoWithContext).testContext

    if (testContext) {
      await cleanupTestUser(request, testContext.testUser)
    }
  })

  test('should register a new user', async ({ request }, testInfo) => {
    const testUserEmail = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const password = generateRandomPassword()
    const phone = '5555555555'
    const zip = '12345-1234'

    const response = await request.post('/v1/authentication/register', {
      data: {
        firstName,
        lastName,
        email: testUserEmail,
        password,
        phone,
        zip,
        signUpMode: 'candidate',
      },
    })

    if (!response.ok()) {
      console.log('Registration failed:', await response.text())
    }
    expect(response.status()).toBe(HttpStatus.CREATED)

    const body = (await response.json()) as RegisterResponse

    expect(body.token).toBeTruthy()
    expect(body.user).toBeTruthy()
    expect(body.user.id).toBeTruthy()
    expect(body.user.email).toBe(testUserEmail)
    expect(body.user.password).toBeUndefined()
    expect(body.user.hasPassword).toBe(true)
    expect(body.campaign).toBeTruthy()
    ;(testInfo as TestInfoWithContext).testContext = {
      testUser: {
        userId: body.user.id,
        authToken: body.token,
      },
    }
  })

  test('should have set-cookie header on registration', async ({
    request,
  }, testInfo) => {
    const testUserEmail = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()

    const response = await request.post('/v1/authentication/register', {
      data: {
        firstName,
        lastName,
        email: testUserEmail,
        password: generateRandomPassword(),
        phone: '5555555555',
        zip: '12345-1234',
        signUpMode: 'candidate',
      },
    })

    expect(response.status()).toBe(HttpStatus.CREATED)

    const setCookieHeader = response.headers()['set-cookie']
    expect(setCookieHeader).toBeTruthy()

    const body = (await response.json()) as RegisterResponse
    ;(testInfo as TestInfoWithContext).testContext = {
      testUser: {
        userId: body.user.id,
        authToken: body.token,
      },
    }
  })

  test('should ignore admin role on registration', async ({
    request,
  }, testInfo) => {
    const testUserEmail = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()

    const response = await request.post('/v1/authentication/register', {
      data: {
        firstName,
        lastName,
        email: testUserEmail,
        password: generateRandomPassword(),
        phone: '5555555555',
        zip: '12345-1234',
        signUpMode: 'candidate',
        roles: ['admin'],
      },
    })

    expect(response.status()).toBe(HttpStatus.CREATED)

    const body = (await response.json()) as RegisterResponse
    expect(body.user.roles).not.toContain('admin')
    ;(testInfo as TestInfoWithContext).testContext = {
      testUser: {
        userId: body.user.id,
        authToken: body.token,
      },
    }
  })
})
