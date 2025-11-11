import { APIRequestContext } from '@playwright/test'
import { faker } from '@faker-js/faker'

export interface LoginResponse {
  token: string
  user: {
    id: number
    email: string
    firstName: string
    lastName: string
    roles: string[]
    hasPassword: boolean
    password?: undefined
  }
  campaign?: {
    id: number
    slug: string
  }
}

export interface RegisterResponse {
  token: string
  user: {
    id: number
    email: string
    firstName: string
    lastName: string
    roles: string[]
    hasPassword: boolean
    password?: undefined
  }
  campaign: {
    id: number
    slug: string
  }
}

export async function loginUser(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await request.post('/v1/authentication/login', {
    data: {
      email,
      password,
    },
  })

  if (!response.ok()) {
    throw new Error(
      `Login failed: ${response.status()} ${await response.text()}`,
    )
  }

  return await response.json()
}

export async function registerUser(
  request: APIRequestContext,
  userData: {
    firstName: string
    lastName: string
    email: string
    password: string
    phone: string
    zip: string
    signUpMode: 'candidate' | 'volunteer'
  },
): Promise<RegisterResponse> {
  const response = await request.post('/v1/authentication/register', {
    data: userData,
  })

  if (!response.ok()) {
    throw new Error(
      `Registration failed: ${response.status()} ${await response.text()}`,
    )
  }

  return await response.json()
}

export async function deleteUser(
  request: APIRequestContext,
  userId: number,
  authToken: string,
): Promise<void> {
  const response = await request.delete(`/v1/users/${userId}`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  })

  if (
    !response.ok() &&
    response.status() !== 401 &&
    response.status() !== 403 &&
    response.status() !== 404
  ) {
    throw new Error(
      `Delete user failed: ${response.status()} ${await response.text()}`,
    )
  }
}

export function generateRandomEmail(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 15)
  return `test-${timestamp}-${random}@goodparty.org`.toLowerCase()
}

export function generateRandomName(): string {
  return faker.person.firstName()
}

export function getBearerToken(token: string): string {
  return `Bearer ${token}`
}
export function generateRandomPassword(): string {
  const letters = faker.string.alpha({ length: 8, casing: 'mixed' })
  const numbers = faker.string.numeric({ length: 4 })
  return faker.helpers.shuffle([...letters, ...numbers]).join('')
}
