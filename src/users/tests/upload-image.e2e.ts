import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
} from '../../../e2e-tests/utils/auth.util'
import * as fs from 'fs'
import * as path from 'path'

interface UserResponse {
  id: number
  email: string
  firstName: string
  lastName: string
  avatar?: string
  password?: undefined
  roles: string[]
  hasPassword: boolean
}

test.describe('Users - Upload Image', () => {
  let testUserId: number
  let authToken: string

  test.afterEach(async ({ request }) => {
    if (testUserId && authToken) {
      await deleteUser(request, testUserId, authToken)
    }
  })

  test('should upload image successfully', async ({ request }) => {
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

    const imagePath = path.join(
      __dirname,
      '../../../e2e-tests/fixtures/test-image.png',
    )
    const imageBuffer = fs.readFileSync(imagePath)

    const response = await request.post('/v1/users/me/upload-image', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        file: {
          name: 'test-image.png',
          mimeType: 'image/png',
          buffer: imageBuffer,
        },
      },
    })

    expect(response.status()).toBe(HttpStatus.CREATED)

    const body = (await response.json()) as UserResponse
    expect(body.avatar).toBeTruthy()
    expect(body.avatar).toMatch(
      /^https:\/\/assets(-dev|-qa)?\.goodparty\.org\/uploads\/.+\.(png|jpg|jpeg)$/,
    )
  })

  test('should reject invalid file type', async ({ request }) => {
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

    const textFilePath = path.join(
      __dirname,
      '../../../e2e-tests/fixtures/test-file.txt',
    )
    const textBuffer = fs.readFileSync(textFilePath)

    const response = await request.post('/v1/users/me/upload-image', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        file: {
          name: 'test-file.txt',
          mimeType: 'text/plain',
          buffer: textBuffer,
        },
      },
    })

    expect(response.status()).toBe(HttpStatus.BAD_REQUEST)
  })

  test('should return 400 when no file is provided', async ({ request }) => {
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

    const response = await request.post('/v1/users/me/upload-image', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {},
    })

    expect(response.status()).toBe(HttpStatus.BAD_REQUEST)
  })

  test('should return 401 when not authenticated', async ({ request }) => {
    const imagePath = path.join(
      __dirname,
      '../../../e2e-tests/fixtures/test-image.png',
    )
    const imageBuffer = fs.readFileSync(imagePath)

    const response = await request.post('/v1/users/me/upload-image', {
      multipart: {
        file: {
          name: 'test-image.png',
          mimeType: 'image/png',
          buffer: imageBuffer,
        },
      },
    })

    expect(response.status()).toBe(HttpStatus.UNAUTHORIZED)
  })
})
