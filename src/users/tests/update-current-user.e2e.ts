import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  cleanupTestUser,
  TestUser,
} from '../../../e2e-tests/utils/auth.util'

interface UserResponse {
  id: number
  email: string
  firstName: string
  lastName: string
  password?: undefined
  roles: string[]
  hasPassword: boolean
}

test.describe('Users - Update Current User', () => {
  let testUserCleanup: TestUser | null = null

  test.afterEach(async ({ request }) => {
    await cleanupTestUser(request, testUserCleanup)
    testUserCleanup = null
  })

  test('should update current user', async ({ request }) => {
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

    const newFirstName = generateRandomName()
    const newLastName = generateRandomName()

    const response = await request.put('/v1/users/me', {
      headers: {
        Authorization: `Bearer ${testUserCleanup.authToken}`,
      },
      data: {
        firstName: newFirstName,
        lastName: newLastName,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const body = (await response.json()) as UserResponse
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
