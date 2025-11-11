import { test, expect } from '@playwright/test'
import {
  registerUser,
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  loginUser,
} from '../../utils/auth.util'

test.describe('Users - Delete User', () => {
  test('should delete user successfully', async ({ request }) => {
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

    const testUserId = registerResponse.user.id
    const authToken = registerResponse.token

    const response = await request.delete(`/v1/users/${testUserId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(204)
  })

  test('should return 204 even when user does not exist', async ({
    request,
  }) => {
    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminEmail || !adminPassword) {
      test.skip()
      return
    }

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

    const testUserId = registerResponse.user.id
    const authToken = registerResponse.token

    await request.delete(`/v1/users/${testUserId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const { token: adminToken } = await loginUser(
      request,
      adminEmail,
      adminPassword,
    )

    const secondResponse = await request.delete(`/v1/users/${testUserId}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })

    expect(secondResponse.status()).toBe(204)
  })

  test('should return 401 when not authenticated', async ({ request }) => {
    const response = await request.delete('/v1/users/999999')

    expect(response.status()).toBe(401)
  })

  test('should only allow owner or admin to delete user', async ({
    request,
  }) => {
    const user1Email = generateRandomEmail()
    const user1Password = generateRandomPassword()

    const user1Response = await registerUser(request, {
      firstName: generateRandomName(),
      lastName: generateRandomName(),
      email: user1Email,
      password: user1Password,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    const user2Response = await registerUser(request, {
      firstName: generateRandomName(),
      lastName: generateRandomName(),
      email: generateRandomEmail(),
      password: generateRandomPassword(),
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    const user1Token = user1Response.token
    const user2Id = user2Response.user.id
    const user2Token = user2Response.token

    const response = await request.delete(`/v1/users/${user2Id}`, {
      headers: {
        Authorization: `Bearer ${user1Token}`,
      },
    })

    expect(response.status()).toBe(403)

    await deleteUser(request, user1Response.user.id, user1Token)
    await deleteUser(request, user2Id, user2Token)
  })
})
