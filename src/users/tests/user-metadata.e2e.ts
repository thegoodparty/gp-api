import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  cleanupTestUser,
} from '../../../e2e-tests/utils/auth.util'
import { faker } from '@faker-js/faker'
import { ReadUserOutput } from '../schemas/ReadUserOutput.schema'
import { TestInfoWithContext } from '../../../e2e-tests/utils/test-context.types'

type MetadataResponse = Record<string, unknown>

test.describe('Users - User Metadata', () => {
  test.afterEach(async ({ request }, testInfo) => {
    const testContext = (testInfo as TestInfoWithContext).testContext

    if (testContext) {
      await cleanupTestUser(request, testContext.testUser)
    }
  })

  test('should get current user metadata', async ({ request }, testInfo) => {
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

    ;(testInfo as TestInfoWithContext).testContext = {
      testUser: {
        userId: registerResponse.user.id,
        authToken: registerResponse.token,
      },
    }

    const response = await request.get('/v1/users/me/metadata', {
      headers: {
        Authorization: `Bearer ${(testInfo as TestInfoWithContext).testContext!.testUser.authToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const body = (await response.json()) as MetadataResponse
    expect(body).toBeTruthy()
  })

  test('should update current user metadata', async ({ request }, testInfo) => {
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

    ;(testInfo as TestInfoWithContext).testContext = {
      testUser: {
        userId: registerResponse.user.id,
        authToken: registerResponse.token,
      },
    }

    const metaData = {
      someString: faker.lorem.sentence(),
      someBoolean: faker.datatype.boolean(),
      someNumber: faker.number.int({ min: 1, max: 1000 }),
      someNull: null,
    }

    const response = await request.put('/v1/users/me/metadata', {
      headers: {
        Authorization: `Bearer ${(testInfo as TestInfoWithContext).testContext!.testUser.authToken}`,
      },
      data: {
        meta: metaData,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const body = (await response.json()) as ReadUserOutput
    expect(body.metaData).toBeTruthy()
    const metadata = body.metaData as MetadataResponse
    expect(metadata?.someString).toBe(metaData.someString)
    expect(metadata?.someBoolean).toBe(metaData.someBoolean)
    expect(metadata?.someNumber).toBe(metaData.someNumber)
    expect(metadata?.someNull).toBe(metaData.someNull)
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
