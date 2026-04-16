import { APIRequestContext } from '@playwright/test'
import { faker } from '@faker-js/faker'
import { HttpStatus } from '@nestjs/common'

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

interface CampaignResponse {
  id: number
  slug: string
}

export async function loginUser(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<LoginResponse> {
  if (!email || !password) {
    throw new Error(
      `Email and password are required for login: email: ${email}, password: ${password}`,
    )
  }
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

  const body = (await response.json()) as Omit<RegisterResponse, 'campaign'>

  const campaignResponse = await request.post('/v1/campaigns', {
    headers: {
      Authorization: `Bearer ${body.token}`,
    },
    data: {
      details: { zip: userData.zip },
    },
  })

  if (!campaignResponse.ok()) {
    throw new Error(
      `Campaign creation failed: ${campaignResponse.status()} ${await campaignResponse.text()}`,
    )
  }

  const campaign = (await campaignResponse.json()) as CampaignResponse

  return { ...body, campaign }
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
    response.status() >= HttpStatus.OK &&
    response.status() <= 299
  ) {
    throw new Error(
      `Delete user failed: ${response.status()} ${await response.text()}`,
    )
  }
}

export function generateRandomEmail(): string {
  return faker.internet
    .email({
      provider: 'goodparty.org',
      firstName: 'test',
      lastName: faker.string.alphanumeric(10),
    })
    .toLowerCase()
}

export function generateRandomName(): string {
  return faker.person.firstName()
}

export function getBearerToken(token: string): string {
  return `Bearer ${token}`
}

export function campaignOrgSlug(campaignId: number): string {
  return `campaign-${campaignId}`
}

export function authHeaders(
  token: string,
  orgSlug: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-slug': orgSlug,
  }
}

export function generateRandomPassword(): string {
  const letters = faker.string.alpha({ length: 8, casing: 'mixed' })
  const numbers = faker.string.numeric({ length: 4 })
  return faker.helpers.shuffle([...letters, ...numbers]).join('')
}

export interface TestUser {
  userId: number
  authToken: string
}

export async function cleanupTestUser(
  request: APIRequestContext,
  cleanup: TestUser | null | undefined,
): Promise<void> {
  if (cleanup && cleanup.userId && cleanup.authToken) {
    await deleteUser(request, cleanup.userId, cleanup.authToken)
  }
}
