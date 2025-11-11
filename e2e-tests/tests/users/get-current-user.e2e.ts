import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  cleanupTestUser,
  TestUser,
} from '../../utils/auth.util'

interface UserResponse {
  id: number
  email: string
  firstName: string
  lastName: string
  password?: undefined
  roles: string[]
  hasPassword: boolean
}

test.describe('Users - Get Current User', () => {
  let testUserCleanup: TestUser | null = null

  test.afterEach(async ({ request }) => {
    await cleanupTestUser(request, testUserCleanup)
    testUserCleanup = null
  })

  test('should get currently authenticated user', async ({ request }) => {
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

    testUserCleanup = {
      userId: registerResponse.user.id,
      authToken: registerResponse.token,
    }

    const { userId: testUserId, authToken } = testUserCleanup

    const response = await request.get('/v1/users/me', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const body = (await response.json()) as UserResponse
    expect(body.id).toBe(testUserId)
    expect(body.email).toBe(email)
    expect(body.firstName).toBe(firstName)
    expect(body.lastName).toBe(lastName)
    expect(body.password).toBeUndefined()
  })

  test('should return 401 when not authenticated', async ({ request }) => {
    const response = await request.get('/v1/users/me')

    expect(response.status()).toBe(HttpStatus.UNAUTHORIZED)
  })
})
