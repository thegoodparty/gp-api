import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import { loginUser } from '../../../e2e-tests/utils/auth.util'

test.describe('Payments', () => {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  test.beforeAll(() => {
    test.skip(!adminEmail || !adminPassword, 'Admin credentials not configured')
  })

  let authToken: string

  test.beforeEach(async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)
    authToken = token
  })

  test('should create checkout session', async ({ request }) => {
    const response = await request.post(
      '/v1/payments/purchase/checkout-session',
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    )

    expect(response.status()).toBe(HttpStatus.CREATED)

    const body = (await response.json()) as { redirectUrl: string }
    expect(body).toHaveProperty('redirectUrl')
    expect(body.redirectUrl).toMatch(
      /^https:\/\/checkout\.stripe\.com\/c\/pay\//,
    )
  })

  test.skip('should create payment portal session', async ({ request }) => {
    const response = await request.post(
      '/v1/payments/purchase/portal-session',
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    )

    expect(response.status()).toBe(HttpStatus.CREATED)

    const body = (await response.json()) as { redirectUrl: string }
    expect(body).toHaveProperty('redirectUrl')
    expect(body.redirectUrl).toMatch(
      /^https:\/\/billing\.stripe\.com\/p\/session\//,
    )
  })
})
