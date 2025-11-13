import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'

test.describe.skip('Error Logger', () => {
  test('should log front end error', async ({ request }) => {
    const response = await request.post('/v1/error-logger', {
      data: {
        message:
          'This is a test. This is only a test. If this were a real alert, your butt would be cinders by now.',
        url: 'https://dev.goodparty.org',
        userEmail: 'test@example.com',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Playwright/1.0.0',
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const body = await response.text()
    expect(body).toBe('ok')
  })
})
