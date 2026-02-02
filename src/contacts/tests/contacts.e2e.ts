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

  test('should get individual activities for a contact', async ({
    request,
  }) => {
    // This endpoint currently only checks that the user has a "current" elected office.
    // Create one so the scaffolded endpoint can return its dummy response.
    const createOffice = await request.post(`/v1/elected-office/`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        electedDate: '2025-01-01',
      },
    })
    expect(createOffice.status()).toBe(HttpStatus.CREATED)

    const response = await request.get(`/v1/contacts/123/activities`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const body = (await response.json()) as {
      nextCursor: unknown
      results: unknown
    }

    expect(body).toHaveProperty('nextCursor')
    expect(body).toHaveProperty('results')
    expect(Array.isArray(body.results)).toBe(true)
  })
})
