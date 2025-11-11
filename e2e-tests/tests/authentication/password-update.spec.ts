import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  LoginResponse,
} from '../../utils/auth.util'

test.describe('Authentication - Password Update', () => {
  let testUserId: number
  let testUserEmail: string
  let authToken: string
  const initialPassword = 'initialPassword123'

  test.beforeEach(async ({ request }) => {
    testUserEmail = generateRandomEmail()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const firstName: string = generateRandomName()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const lastName: string = generateRandomName()
    const result = await registerUser(request, {
      firstName,
      lastName,
      email: testUserEmail,
      password: initialPassword,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })
    testUserId = result.user.id
    authToken = result.token
  })

  test.afterEach(async ({ request }) => {
    if (testUserId && authToken) {
      await deleteUser(request, testUserId, authToken)
    }
  })

  test('should update user password', async ({ request }) => {
    const newPassword = 'updatedPassword456'

    const response = await request.put(`/v1/users/${testUserId}/password`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        oldPassword: initialPassword,
        newPassword: newPassword,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)
  })

  test('should login with updated password', async ({ request }) => {
    const newPassword = 'updatedPassword456'

    await request.put(`/v1/users/${testUserId}/password`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
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

    authToken = body.token
  })
})
