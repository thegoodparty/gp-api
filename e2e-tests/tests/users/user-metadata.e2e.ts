import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  cleanupTestUser,
  TestUser,
} from '../../utils/auth.util'
import { faker } from '@faker-js/faker'

interface MetadataResponse {
  [key: string]: unknown
}

interface UserWithMetadata {
  id: number
  email: string
  metaData: MetadataResponse | null
}

test.describe('Users - User Metadata', () => {
  let testUserCleanup: TestUser | null = null

  test.afterEach(async ({ request }) => {
    await cleanupTestUser(request, testUserCleanup)
    testUserCleanup = null
  })

  test('should get current user metadata', async ({ request }) => {
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

    testUserCleanup = {
      userId: registerResponse.user.id,
      authToken: registerResponse.token,
    }

    const response = await request.get('/v1/users/me/metadata', {
      headers: {
        Authorization: `Bearer ${testUserCleanup.authToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const body = (await response.json()) as MetadataResponse
    expect(body).toBeTruthy()
  })

  test('should update current user metadata', async ({ request }) => {
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

    testUserCleanup = {
      userId: registerResponse.user.id,
      authToken: registerResponse.token,
    }

    const metaData = {
      someString: faker.lorem.sentence(),
      someBoolean: faker.datatype.boolean(),
      someNumber: faker.number.int({ min: 1, max: 1000 }),
      someNull: null,
    }

    const response = await request.put('/v1/users/me/metadata', {
      headers: {
        Authorization: `Bearer ${testUserCleanup.authToken}`,
      },
      data: {
        meta: metaData,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const body = (await response.json()) as UserWithMetadata
    expect(body.metaData).toBeTruthy()
    expect(body.metaData?.someString).toBe(metaData.someString)
    expect(body.metaData?.someBoolean).toBe(metaData.someBoolean)
    expect(body.metaData?.someNumber).toBe(metaData.someNumber)
    expect(body.metaData?.someNull).toBe(metaData.someNull)
  })

  test('should return 401 when getting metadata without authentication', async ({
    request,
  }) => {
    const response = await request.get('/v1/users/me/metadata')

    expect(response.status()).toBe(HttpStatus.UNAUTHORIZED)
  })

  test('should return 401 when updating metadata without authentication', async ({
    request,
  }) => {
    const response = await request.put('/v1/users/me/metadata', {
      data: {
        meta: { test: 'value' },
      },
    })

    expect(response.status()).toBe(HttpStatus.UNAUTHORIZED)
  })
})
