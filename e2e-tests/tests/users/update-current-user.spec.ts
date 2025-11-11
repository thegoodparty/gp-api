import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
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

test.describe('Users - Update Current User', () => {
  let testUserId: number
  let authToken: string

  test.afterEach(async ({ request }) => {
    if (testUserId && authToken) {
      await deleteUser(request, testUserId, authToken)
    }
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

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    const newFirstName = generateRandomName()
    const newLastName = generateRandomName()

    const response = await request.put('/v1/users/me', {
      headers: {
        Authorization: `Bearer ${authToken}`,
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
