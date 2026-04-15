import { HttpStatus } from '@nestjs/common'
import { APIRequestContext, expect, test } from '@playwright/test'
import {
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  registerUser,
} from '../../../e2e-tests/utils/auth.util'
import { updateCampaignWithRetry } from '../../../e2e-tests/utils/request.util'

const CONTACTS_TEST_DISTRICT = {
  id: '0e5bafca-93a9-86a5-2522-f373979720df',
  type: 'City_Ward',
  name: 'CHEYENNE CITY WARD 1',
  state: 'WY',
} as const
const CONTACTS_TEST_POSITION_ID =
  'Z2lkOi8vYmFsbG90LWZhY3RvcnkvUG9zaXRpb24vMTczNzA2'

/**
 * Campaign org slug (`campaign-${id}`) must be sent so contacts use
 * `resolveDistrictInfoFromOrg` (position / overrideDistrict).
 */
let campaignOrgSlug = ''

const AUTH_HEADER = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'x-organization-slug': campaignOrgSlug,
})

async function assertOk(
  response: Awaited<ReturnType<APIRequestContext['get']>>,
  errorPrefix: string,
) {
  if (!response.ok()) {
    throw new Error(
      `${errorPrefix}: ${response.status()} ${await response.text()}`,
    )
  }
}

async function updateCampaignMine(params: {
  request: APIRequestContext
  authToken: string
  data: Record<string, unknown>
}) {
  const { request, authToken, data } = params

  const response = await updateCampaignWithRetry(
    request,
    authToken,
    data,
    campaignOrgSlug,
  )
  await assertOk(response, 'Campaign update failed')
}

async function createElectedOffice(params: {
  request: APIRequestContext
  authToken: string
}) {
  const { request, authToken } = params
  const response = await request.post('/v1/elected-office', {
    headers: AUTH_HEADER(authToken),
    data: {
      swornInDate: '2025-01-01',
    },
  })

  await assertOk(response, 'Elected office creation failed')
  const payload = (await response.json()) as { id: string }
  return payload.id
}

async function setOrganizationPosition(params: {
  request: APIRequestContext
  authToken: string
}) {
  const { request, authToken } = params
  const response = await request.patch(`/v1/organizations/${campaignOrgSlug}`, {
    headers: AUTH_HEADER(authToken),
    data: { ballotReadyPositionId: CONTACTS_TEST_POSITION_ID },
  })
  await assertOk(response, 'Organization position update failed')
}

async function prepareCampaignAndOffice(params: {
  request: APIRequestContext
  authToken: string
}) {
  const { request, authToken } = params
  await setOrganizationPosition({ request, authToken })
  await updateCampaignMine({
    request,
    authToken,
    data: {
      details: {
        state: CONTACTS_TEST_DISTRICT.state,
        zip: '82001',
        electionDate: '2026-11-03',
        ballotLevel: 'CITY',
      },
    },
  })
  return createElectedOffice({ request, authToken })
}

const EO_AUTH_HEADER = (token: string, eoSlug: string) => ({
  Authorization: `Bearer ${token}`,
  'x-organization-slug': eoSlug,
})

test.describe('Contacts and Segments', () => {
  let authToken: string
  let testUserId: number
  let testAuthToken: string
  let eoOrgSlug: string

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
    campaignOrgSlug = `campaign-${registerResponse.campaign.id}`

    const electedOfficeId = await prepareCampaignAndOffice({
      request,
      authToken,
    })
    eoOrgSlug = `eo-${electedOfficeId}`
  })

  test.afterEach(async ({ request }) => {
    if (testUserId && testAuthToken) {
      await deleteUser(request, testUserId, testAuthToken)
    }
  })

  test('should return 401 when listing contacts without auth', async ({
    request,
  }) => {
    const response = await request.get(`/v1/contacts`)
    expect(response.status()).toBe(HttpStatus.UNAUTHORIZED)
  })

  test('should list contacts for seeded district with populated people and valid pagination', async ({
    request,
  }) => {
    const response = await request.get(`/v1/contacts`, {
      headers: AUTH_HEADER(authToken),
    })

    expect(response.status()).toBe(HttpStatus.OK)
    const contacts = (await response.json()) as {
      people: Array<{ id: string; state: string; firstName?: string | null }>
      pagination: {
        totalResults: number
        currentPage: number
        pageSize: number
        totalPages: number
        hasNextPage: boolean
        hasPreviousPage: boolean
      }
    }
    expect(Array.isArray(contacts.people)).toBe(true)
    expect(contacts.people.length).toBeGreaterThan(0)
    expect(contacts.pagination.totalResults).toBeGreaterThan(0)
    expect(typeof contacts.pagination.currentPage).toBe('number')
    expect(typeof contacts.pagination.pageSize).toBe('number')
    expect(typeof contacts.pagination.totalPages).toBe('number')
    expect(typeof contacts.pagination.hasNextPage).toBe('boolean')
    expect(typeof contacts.pagination.hasPreviousPage).toBe('boolean')
    expect(contacts.people[0].id).toBeTruthy()
    expect(contacts.people[0].state).toBe(CONTACTS_TEST_DISTRICT.state)
  })

  test('should return populated district stats for seeded district', async ({
    request,
  }) => {
    const response = await request.get(`/v1/contacts/stats`, {
      headers: AUTH_HEADER(authToken),
    })

    expect(response.status()).toBe(HttpStatus.OK)
    const stats = (await response.json()) as {
      districtId: string
      computedAt?: string
      totalConstituents: number
      totalConstituentsWithCellPhone?: number
      buckets: Record<string, unknown> & {
        age?: { buckets?: unknown[] }
        homeowner?: { buckets?: unknown[] }
        education?: { buckets?: unknown[] }
      }
    }
    // District id comes from election-api for CONTACTS_TEST_POSITION_ID, not the legacy People seed id.
    expect(stats.districtId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(stats.totalConstituents).toBeGreaterThan(0)
    if (stats.computedAt !== undefined) {
      expect(typeof stats.computedAt).toBe('string')
    }
    if (stats.totalConstituentsWithCellPhone !== undefined) {
      expect(stats.totalConstituentsWithCellPhone).toBeGreaterThanOrEqual(0)
    }
    expect(stats).toHaveProperty('buckets')
    expect(stats.buckets).toHaveProperty('age')
    expect(stats.buckets).toHaveProperty('homeowner')
    expect(stats.buckets).toHaveProperty('education')
    if (stats.buckets.age?.buckets) {
      expect(stats.buckets.age.buckets.length).toBeGreaterThan(0)
    }
  })

  test('should download non-empty contacts CSV for seeded district', async ({
    request,
  }) => {
    test.setTimeout(120_000)
    const response = await request.get(`/v1/contacts/download`, {
      headers: EO_AUTH_HEADER(authToken, eoOrgSlug),
    })

    expect(response.status()).toBe(HttpStatus.OK)
    const contentType = response.headers()['content-type']
    const contentDisposition = response.headers()['content-disposition']
    const body = await response.body()
    const csv = body.toString('utf-8')
    const lines = csv
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (contentType !== undefined) {
      expect(contentType).toContain('text/csv')
    }
    if (contentDisposition !== undefined) {
      expect(contentDisposition).toContain('contacts.csv')
    }
    expect(body.length).toBeGreaterThan(0)
    expect(lines.length).toBeGreaterThan(1) // header + at least one record
    expect(lines[0]).toContain(',')
  })

  test('should fetch a listed contact by id and return full person payload', async ({
    request,
  }) => {
    const listResponse = await request.get(`/v1/contacts`, {
      headers: AUTH_HEADER(authToken),
    })

    expect(listResponse.status()).toBe(HttpStatus.OK)
    const listPayload = (await listResponse.json()) as {
      people: Array<{ id: string }>
    }
    expect(listPayload.people.length).toBeGreaterThan(0)

    const personResponse = await request.get(
      `/v1/contacts/${listPayload.people[0].id}`,
      {
        headers: AUTH_HEADER(authToken),
      },
    )

    expect(personResponse.status()).toBe(HttpStatus.OK)
    const person = (await personResponse.json()) as {
      id: string
      state: string
      firstName?: string | null
      lastName?: string | null
      address?: { city?: string | null; state?: string | null }
    }
    expect(person.id).toBe(listPayload.people[0].id)
    expect(person.state).toBe(CONTACTS_TEST_DISTRICT.state)
    expect(person).toHaveProperty('address')
  })
})
