import { test, expect } from '@playwright/test'
import { RegisterResponse, LoginResponse } from '../../utils/auth.util'

test.describe.skip('Authentication - Social OAuth (Google)', () => {
  test('should register OAuth user', async ({ request }) => {
    const response = await request.post('/v1/authentication/register', {
      data: {
        firstName: 'OAuth',
        lastName: 'User',
        email: 'oauth-test@example.com',
        phone: '5555555555',
        zip: '12345-1234',
        roles: ['admin'],
      },
    })

    expect(response.status()).toBe(201)

    const body = (await response.json()) as RegisterResponse
    expect(body.token).toBeTruthy()
    expect(body.user).toBeTruthy()
    expect(body.user.id).toBeTruthy()
    expect(body.user.password).toBeUndefined()
    expect(body.user.roles).not.toContain('admin')
  })

  test('should login with Google OAuth', async ({ request }) => {
    const response = await request.post(
      '/v1/authentication/social-login/google',
      {
        data: {
          email: 'oauth-test@example.com',
          socialToken: 'mock-google-token',
          socialPic: 'https://example.com/pic.jpg',
        },
      },
    )

    expect(response.status()).toBe(201)

    const body = (await response.json()) as LoginResponse
    expect(body.token).toBeTruthy()
    expect(body.user).toBeTruthy()
    expect(body.user.password).toBeUndefined()
    expect(body.user.hasPassword).toBe(false)
  })

  test('should verify access to OAuth user', async ({ request }) => {
    const loginResponse = await request.post(
      '/v1/authentication/social-login/google',
      {
        data: {
          email: 'oauth-test@example.com',
          socialToken: 'mock-google-token',
          socialPic: 'https://example.com/pic.jpg',
        },
      },
    )

    const { token, user } = (await loginResponse.json()) as LoginResponse

    const userResponse = await request.get(`/v1/users/${user.id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(userResponse.status()).toBe(200)

    const userData = (await userResponse.json()) as LoginResponse['user']
    expect(userData.id).toBe(user.id)
    expect(userData.password).toBeUndefined()
    expect(userData.hasPassword).toBe(false)
  })
})
