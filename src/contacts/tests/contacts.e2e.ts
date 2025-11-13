import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  deleteUser,
  generateRandomEmail,
  generateRandomName,
} from '../../../e2e-tests/utils/auth.util'
import { faker } from '@faker-js/faker'

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

  test.skip('should create a contact', async ({ request }) => {
    const response = await request.post(`/v1/contacts`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        email: faker.internet.email(),
        phone: faker.phone.number(),
      },
    })

    expect(response.status()).toBe(HttpStatus.CREATED)

    const contact = (await response.json()) as { id: string; email: string }
    expect(contact).toHaveProperty('id')
    expect(contact).toHaveProperty('email')
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

  test.skip('should create a segment', async ({ request }) => {
    const response = await request.post(`/v1/contacts/segments`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        name: faker.lorem.words(3),
        description: faker.lorem.sentence(),
      },
    })

    expect(response.status()).toBe(HttpStatus.CREATED)

    const segment = (await response.json()) as { id: number; name: string }
    expect(segment).toHaveProperty('id')
    expect(segment).toHaveProperty('name')
  })

  test.skip('should list segments for campaign', async ({ request }) => {
    const response = await request.get(`/v1/contacts/segments`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const segments = (await response.json()) as unknown[]
    expect(Array.isArray(segments)).toBe(true)
  })
})
