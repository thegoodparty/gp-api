import { test, expect } from '@playwright/test'
import {
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  registerUser,
  RegisterResponse,
} from '../../../../e2e-tests/utils/auth.util'

const WINNERS_YEAR = process.env.WINNERS_ELECTION_YEAR || '2024'
const UNIQUE_PARTY = `E2ETestParty_${Date.now()}`

test.describe('Campaigns Map - Get Map', () => {
  let reg: RegisterResponse

  test.beforeAll(async ({ request }) => {
    reg = await registerUser(request, {
      firstName: generateRandomName(),
      lastName: generateRandomName(),
      email: generateRandomEmail(),
      password: generateRandomPassword(),
      phone: '5555555555',
      zip: '90210',
      signUpMode: 'candidate',
    })

    await request.put('/v1/campaigns/mine', {
      headers: { Authorization: `Bearer ${reg.token}` },
      data: {
        details: {
          office: 'City Council',
          party: UNIQUE_PARTY,
          state: 'CA',
          zip: '90210',
          ballotLevel: 'Local',
          electionDate: `${WINNERS_YEAR}-11-05`,
          geoLocation: { lat: 34.0901, lng: -118.4065 },
        },
      },
    })

    await request.post('/v1/campaigns/launch', {
      headers: { Authorization: `Bearer ${reg.token}` },
    })
  })

  test.afterAll(async ({ request }) => {
    if (reg?.user?.id && reg?.token) {
      await deleteUser(request, reg.user.id, reg.token)
    }
  })

  test('should return campaigns map with results filter', async ({
    request,
  }) => {
    const response = await request.get(
      `/v1/campaigns/map?party=${UNIQUE_PARTY}&results=true`,
    )

    expect(response.status()).toBe(200)

    const body = (await response.json()) as Record<
      string,
      string | number | boolean
    >[]
    expect(Array.isArray(body)).toBe(true)
  })

  test('should return campaign filtered by party', async ({ request }) => {
    const response = await request.get(
      `/v1/campaigns/map?party=${UNIQUE_PARTY}`,
    )

    expect(response.status()).toBe(200)

    const body = (await response.json()) as Array<{
      slug: string
      firstName: string
      lastName: string
    }>
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(1)

    const ours = body.find((c) => c.slug === reg.campaign.slug)
    expect(ours).toBeTruthy()
  })

  test('should filter campaigns by level', async ({ request }) => {
    const response = await request.get('/v1/campaigns/map?level=Local')

    expect(response.status()).toBe(200)

    const body = (await response.json()) as Record<
      string,
      string | number | boolean
    >[]
    expect(Array.isArray(body)).toBe(true)
  })

  test('should filter campaigns by office', async ({ request }) => {
    const response = await request.get('/v1/campaigns/map?office=City+Council')

    expect(response.status()).toBe(200)

    const body = (await response.json()) as Record<
      string,
      string | number | boolean
    >[]
    expect(Array.isArray(body)).toBe(true)
  })
})
