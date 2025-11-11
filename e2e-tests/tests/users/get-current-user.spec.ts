import { test, expect } from '@playwright/test'
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

test.describe('Users - Get Current User', () => {
  let testUserId: number
  let authToken: string

  test.afterEach(async ({ request }) => {
    if (testUserId && authToken) {
      await deleteUser(request, testUserId, authToken)
    }
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

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    const response = await request.get('/v1/users/me', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(200)

    const body = (await response.json()) as UserResponse
    expect(body.id).toBe(testUserId)
    expect(body.email).toBe(email)
    expect(body.firstName).toBe(firstName)
    expect(body.lastName).toBe(lastName)
    expect(body.password).toBeUndefined()
  })

  test('should return 401 when not authenticated', async ({ request }) => {
    const response = await request.get('/v1/users/me')

    expect(response.status()).toBe(401)
  })
})
