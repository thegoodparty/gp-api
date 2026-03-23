import { test, expect } from '@playwright/test'
import {
  registerUser,
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
} from '../../../e2e-tests/utils/auth.util'
import { faker } from '@faker-js/faker'
import { WebsiteContact } from '@prisma/client'

test.describe('Websites - Contacts', () => {
  let testUserId: number | undefined
  let authToken: string | undefined

  test.afterEach(async ({ request }) => {
    if (testUserId && authToken) {
      await deleteUser(request, testUserId, authToken)
      testUserId = undefined
      authToken = undefined
    }
  })

  test('should submit contact form on published website', async ({
    request,
  }) => {
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

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const vanityPath = `contact-path-${Date.now()}`

    await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        vanityPath,
        status: 'published',
      },
    })

    const contactData = {
      name: faker.person.fullName(),
      email: faker.internet.email(),
      phone: '5555555555',
      message: faker.lorem.paragraph(),
      smsConsent: faker.datatype.boolean(),
    }

    const response = await request.post(
      `/v1/websites/${vanityPath}/contact-form`,
      {
        data: contactData,
      },
    )

    expect(response.status()).toBe(201)

    const contact = (await response.json()) as WebsiteContact
    expect(contact.name).toBe(contactData.name)
    expect(contact.email).toBe(contactData.email)
    expect(contact.phone).toBe(contactData.phone)
    expect(contact.message).toBe(contactData.message)
    expect(contact.smsConsent).toBe(contactData.smsConsent)
  })

  test('should return 403 for contact form on unpublished website', async ({
    request,
  }) => {
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

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const vanityPath = `unpublished-contact-${Date.now()}`

    await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        vanityPath,
        status: 'unpublished',
      },
    })

    const response = await request.post(
      `/v1/websites/${vanityPath}/contact-form`,
      {
        data: {
          name: faker.person.fullName(),
          email: faker.internet.email(),
          phone: '5555555555',
          message: faker.lorem.paragraph(),
          smsConsent: true,
        },
      },
    )

    expect(response.status()).toBe(403)
  })

  test('should get website contacts', async ({ request }) => {
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

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const vanityPath = `get-contacts-${Date.now()}`

    await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        vanityPath,
        status: 'published',
      },
    })

    await request.post(`/v1/websites/${vanityPath}/contact-form`, {
      data: {
        name: faker.person.fullName(),
        email: faker.internet.email(),
        phone: '5555555555',
        message: faker.lorem.paragraph(),
        smsConsent: true,
      },
    })

    const response = await request.get('/v1/websites/mine/contacts', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(200)

    const result = (await response.json()) as {
      contacts: WebsiteContact[]
      total: number
      page: number
      limit: number
      totalPages: number
    }

    expect(result.contacts).toBeInstanceOf(Array)
    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(25)
    expect(result.totalPages).toBeGreaterThanOrEqual(1)
  })

  test('should get website contacts with pagination', async ({ request }) => {
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

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const vanityPath = `pagination-contacts-${Date.now()}`

    await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        vanityPath,
        status: 'published',
      },
    })

    for (let i = 0; i < 3; i++) {
      await request.post(`/v1/websites/${vanityPath}/contact-form`, {
        data: {
          name: faker.person.fullName(),
          email: faker.internet.email(),
          phone: '5555555555',
          message: faker.lorem.paragraph(),
          smsConsent: true,
        },
      })
    }

    const response = await request.get(
      '/v1/websites/mine/contacts?limit=2&page=1',
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const result = (await response.json()) as {
      contacts: WebsiteContact[]
      total: number
      page: number
      limit: number
      totalPages: number
    }

    expect(result.contacts).toBeInstanceOf(Array)
    expect(result.contacts.length).toBeLessThanOrEqual(2)
    expect(result.limit).toBe(2)
  })

  test('should return 401 when getting contacts without auth', async ({
    request,
  }) => {
    const response = await request.get('/v1/websites/mine/contacts')

    expect(response.status()).toBe(401)
  })
})
