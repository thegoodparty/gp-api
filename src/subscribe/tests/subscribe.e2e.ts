import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import { generateRandomEmail } from '../../../e2e-tests/utils/auth.util'

test.describe('Subscribe - Email Subscription', () => {
  test('should subscribe email successfully', async ({ request }) => {
    const email = generateRandomEmail()

    const response = await request.post('/v1/subscribe', {
      data: {
        email,
        uri: 'https://example.com',
      },
    })

    expect(response.status()).toBe(HttpStatus.CREATED)
  })
})
