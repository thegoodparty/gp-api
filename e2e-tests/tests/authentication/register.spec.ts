import { test, expect } from '@playwright/test'
import {
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  RegisterResponse,
} from '../../utils/auth.util'

test.describe('Authentication - Register', () => {
  let testUserId: number
  let testUserEmail: string
  let authToken: string

  test.afterEach(async ({ request }) => {
    if (testUserId && authToken) {
      await deleteUser(request, testUserId, authToken)
    }
  })

  test('should register a new user', async ({ request }) => {
    testUserEmail = generateRandomEmail()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const firstName: string = generateRandomName()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const lastName: string = generateRandomName()
    const password = 'no1TalksAboutFightClub'
    const phone = '5555555555'
    const zip = '12345-1234'

    const response = await request.post('/v1/authentication/register', {
      data: {
        firstName,
        lastName,
        email: testUserEmail,
        password,
        phone,
        zip,
        signUpMode: 'candidate',
      },
    })

    expect(response.status()).toBe(201)

    const body = (await response.json()) as RegisterResponse

    expect(body.token).toBeTruthy()
    expect(body.user).toBeTruthy()
    expect(body.user.id).toBeTruthy()
    expect(body.user.email).toBe(testUserEmail)
    expect(body.user.password).toBeUndefined()
    expect(body.user.hasPassword).toBe(true)
    expect(body.campaign).toBeTruthy()

    testUserId = body.user.id
    authToken = body.token
  })

  test('should have set-cookie header on registration', async ({ request }) => {
    testUserEmail = generateRandomEmail()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const firstName = generateRandomName()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const lastName = generateRandomName()

    const response = await request.post('/v1/authentication/register', {
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        firstName,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        lastName,
        email: testUserEmail,
        password: 'no1TalksAboutFightClub',
        phone: '5555555555',
        zip: '12345-1234',
        signUpMode: 'candidate',
      },
    })

    expect(response.status()).toBe(201)

    const setCookieHeader = response.headers()['set-cookie']
    expect(setCookieHeader).toBeTruthy()

    const body = (await response.json()) as RegisterResponse
    testUserId = body.user.id
    authToken = body.token
  })

  test('should ignore admin role on registration', async ({ request }) => {
    testUserEmail = generateRandomEmail()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const firstName = generateRandomName()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const lastName = generateRandomName()

    const response = await request.post('/v1/authentication/register', {
      data: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        firstName,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        lastName,
        email: testUserEmail,
        password: 'no1TalksAboutFightClub',
        phone: '5555555555',
        zip: '12345-1234',
        signUpMode: 'candidate',
        roles: ['admin'],
      },
    })

    expect(response.status()).toBe(201)

    const body = (await response.json()) as RegisterResponse
    expect(body.user.roles).not.toContain('admin')

    testUserId = body.user.id
    authToken = body.token
  })
})
