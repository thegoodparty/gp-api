import { test, expect } from '@playwright/test'
import { loginUser, LoginResponse } from '../../utils/auth.util'

test.describe('Authentication - Login', () => {
  const candidateEmail = process.env.CANDIDATE_EMAIL
  const candidatePassword = process.env.CANDIDATE_PASSWORD
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  const hasCredentials = !!(
    candidateEmail &&
    candidatePassword &&
    adminEmail &&
    adminPassword
  )

  test('should login candidate user with email and password', async ({
    request,
  }) => {
    test.skip(!hasCredentials, 'Credentials not configured in .env')

    const response = await request.post('/v1/authentication/login', {
      data: {
        email: candidateEmail!,
        password: candidatePassword!,
      },
    })

    expect(response.status()).toBe(201)

    const body = (await response.json()) as LoginResponse

    expect(body.token).toBeTruthy()
    expect(body.user).toBeTruthy()
    expect(body.user.id).toBeTruthy()
    expect(body.user.email).toBe(candidateEmail)
    expect(body.user.password).toBeUndefined()
    expect(body.user.hasPassword).toBe(true)
    expect(body.user.roles).not.toContain('admin')
  })

  test('should login admin user with email and password', async ({
    request,
  }) => {
    test.skip(!hasCredentials, 'Credentials not configured in .env')

    const response = await request.post('/v1/authentication/login', {
      data: {
        email: adminEmail!,
        password: adminPassword!,
      },
    })

    expect(response.status()).toBe(201)

    const body = (await response.json()) as LoginResponse

    expect(body.token).toBeTruthy()
    expect(body.user).toBeTruthy()
    expect(body.user.password).toBeUndefined()
    expect(body.user.hasPassword).toBe(true)
    expect(body.user.roles).toContain('admin')
  })

  test('should return 401 for invalid credentials', async ({ request }) => {
    test.skip(!hasCredentials, 'Credentials not configured in .env')

    const response = await request.post('/v1/authentication/login', {
      data: {
        email: candidateEmail!,
        password: candidatePassword! + 'BAD',
      },
    })

    expect(response.status()).toBe(401)
  })

  test('should set auth token in response', async ({ request }) => {
    test.skip(!hasCredentials, 'Credentials not configured in .env')

    const { token, user } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(20)
    expect(user.email).toBe(candidateEmail)
  })
})
