import { APIRequestContext } from '@playwright/test'
import { faker } from '@faker-js/faker'
import { HttpStatus } from '@nestjs/common'
import { createClerkClient } from '@clerk/backend'
import { ClerkAPIResponseError } from '@clerk/shared/error'

let _clerkClient: ReturnType<typeof createClerkClient> | null = null

const clerkUserIds = new Map<number, string>()
const clerkUserIdCache = new Map<string, string>()

const getClerkClient = () => {
  if (!_clerkClient) {
    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) {
      throw new Error('CLERK_SECRET_KEY env var is required')
    }
    _clerkClient = createClerkClient({ secretKey })
  }
  return _clerkClient
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries = 5,
): Promise<T> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isRateLimit =
        err instanceof ClerkAPIResponseError && err.status === 429
      if (!isRateLimit || attempt === maxRetries) throw err
      const delay = 200 * 4 ** attempt + Math.random() * 100
      await sleep(delay)
    }
  }
  throw new Error('withRetry: unreachable')
}

const getSessionToken = async (clerkUserId: string): Promise<string> =>
  withRetry(async () => {
    const clerk = getClerkClient()
    const session = await clerk.sessions.createSession({
      userId: clerkUserId,
    })
    const { jwt } = await clerk.sessions.getToken(session.id, '')
    if (!jwt) {
      throw new Error(`Failed to get session token for ${clerkUserId}`)
    }
    return jwt
  })

const getClerkUserIdByEmail = async (email: string): Promise<string> => {
  const cached = clerkUserIdCache.get(email)
  if (cached) return cached

  return withRetry(async () => {
    const clerk = getClerkClient()
    const users = await clerk.users.getUserList({
      emailAddress: [email],
    })
    if (users.data.length === 0) {
      throw new Error(`No Clerk user found for email: ${email}`)
    }
    const id = users.data[0].id
    clerkUserIdCache.set(email, id)
    return id
  })
}

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

const fetchUserMe = async (
  request: APIRequestContext,
  token: string,
  label: string,
): Promise<LoginResponse['user']> => {
  const headers = { Authorization: `Bearer ${token}` }
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await request.get('/v1/users/me', {
      headers,
    })
    if (res.ok()) return (await res.json()) as LoginResponse['user']
    if (attempt === 4) {
      throw new Error(`${label}: ${res.status()} ${await res.text()}`)
    }
    await sleep(200 * 4 ** attempt)
  }
  throw new Error(`${label}: all attempts exhausted`)
}

export async function loginUser(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<LoginResponse> {
  if (!email || !password) {
    throw new Error(`Email and password are required for login: email=${email}`)
  }

  const clerkUserId = await getClerkUserIdByEmail(email)
  const token = await getSessionToken(clerkUserId)
  const user = await fetchUserMe(request, token, 'Login failed')

  return { token, user }
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
  const clerkUser = await withRetry(() =>
    getClerkClient().users.createUser({
      emailAddress: [userData.email],
      password: userData.password,
      firstName: userData.firstName,
      lastName: userData.lastName,
      skipPasswordChecks: true,
    }),
  )

  const token = await getSessionToken(clerkUser.id)
  const authHeaders = {
    Authorization: `Bearer ${token}`,
  }

  const user = await fetchUserMe(request, token, 'User provisioning failed')

  clerkUserIds.set(user.id, clerkUser.id)

  const campaignResponse = await request.post('/v1/campaigns', {
    headers: authHeaders,
    data: { details: { zip: userData.zip } },
  })

  if (!campaignResponse.ok()) {
    throw new Error(
      `Campaign creation failed: ${campaignResponse.status()} ${await campaignResponse.text()}`,
    )
  }

  const campaign = (await campaignResponse.json()) as CampaignResponse

  return { token, user, campaign }
}

export async function deleteUser(
  request: APIRequestContext,
  userId: number,
  authToken: string,
): Promise<void> {
  const clerkUserId = clerkUserIds.get(userId)
  if (clerkUserId) {
    try {
      await withRetry(() => getClerkClient().users.deleteUser(clerkUserId))
    } catch {
      // Clerk deletion is best-effort during cleanup
    }
    clerkUserIds.delete(userId)
  }

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
