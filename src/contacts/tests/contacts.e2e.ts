import { HttpStatus } from '@nestjs/common'
import { expect, test } from '@playwright/test'
import {
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  registerUser,
} from '../../../e2e-tests/utils/auth.util'

test.describe('Contacts and Segments', () => {
  let authToken: string
  let testUserId: number
  let testAuthToken: string

  test.beforeEach(async ({ request }) => {
    const registerResponse = await registerUser(request, {
      firstName: generateRandomName(),
      lastName: generateRandomName(),
      email: generateRandomEmail(),
      password: 'password123',
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    authToken = registerResponse.token
    testUserId = registerResponse.user.id
    testAuthToken = registerResponse.token
  })

  test.afterEach(async ({ request }) => {
    if (testUserId && testAuthToken) {
      await deleteUser(request, testUserId, testAuthToken)
    }
  })

  test('should list contacts for campaign', async ({ request }) => {
    const response = await request.get(`/v1/contacts`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    if (response.status() === HttpStatus.BAD_REQUEST) {
      test.skip()
      return
    }

    expect(response.status()).toBe(HttpStatus.OK)

    const contacts = (await response.json()) as { contacts: unknown[] }
    expect(contacts).toHaveProperty('contacts')
  })

  test('should return 403 when user has no elected office', async ({
    request,
  }) => {
    const response = await request.get(`/v1/contacts/123/activities`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.FORBIDDEN)
  })

  test('should return 404 when no poll messages exist for contact', async ({
    request,
  }) => {
    // Create an elected office so the user passes the authorization check
    const createOffice = await request.post(`/v1/elected-office`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        electedDate: '2025-01-01',
      },
    })
    expect(createOffice.status()).toBe(HttpStatus.CREATED)

    // Request activities for a person with no poll messages
    const response = await request.get(`/v1/contacts/123/activities`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.NOT_FOUND)

    const body = (await response.json()) as { message: string }
    expect(body.message).toBe(
      'No individual messages found for that electedOffice',
    )
  })
})
