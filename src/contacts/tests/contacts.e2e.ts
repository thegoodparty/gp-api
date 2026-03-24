import { HttpStatus } from '@nestjs/common'
import { APIRequestContext, expect, test } from '@playwright/test'
import { P2VStatus } from '../../elections/types/pathToVictory.types'
import { P2VSource } from '../../pathToVictory/types/pathToVictory.types'
import {
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  loginUser,
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

const AUTH_HEADER = (token: string) => ({
  Authorization: `Bearer ${token}`,
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

  const response = await updateCampaignWithRetry(request, authToken, data)
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

async function updateElectedOffice(params: {
  request: APIRequestContext
  authToken: string
  electedOfficeId: string
  data: Record<string, unknown>
}) {
  const { request, authToken, electedOfficeId, data } = params
  const response = await request.put(`/v1/elected-office/${electedOfficeId}`, {
    headers: AUTH_HEADER(authToken),
    data,
  })

  await assertOk(response, 'Elected office update failed')
}

async function prepareCampaignAndOffice(params: {
  request: APIRequestContext
  authToken: string
}) {
  const { request, authToken } = params
  await updateCampaignMine({
    request,
    authToken,
    data: {
      details: {
        state: CONTACTS_TEST_DISTRICT.state,
        zip: '82001',
        office: 'Other',
        otherOffice: 'Cheyenne City Council Ward 1',
        positionId: CONTACTS_TEST_POSITION_ID,
        electionDate: '2026-11-03',
        ballotLevel: 'CITY',
      },
      pathToVictory: {
        source: P2VSource.ElectionApi,
        p2vStatus: P2VStatus.complete,
        winNumber: 3142,
        districtId: CONTACTS_TEST_DISTRICT.id,
        electionType: CONTACTS_TEST_DISTRICT.type,
        electionLocation: CONTACTS_TEST_DISTRICT.name,
        p2vCompleteDate: '2025-09-25',
        projectedTurnout: 6282,
        voterContactGoal: 15710,
        districtManuallySet: false,
      },
    },
  })
  return createElectedOffice({ request, authToken })
}

async function approveCampaignForStatewideDownload(params: {
  request: APIRequestContext
  campaignSlug: string
}) {
  const { request, campaignSlug } = params
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminEmail || !adminPassword) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD are required for statewide contacts e2e setup',
    )
  }

  const admin = await loginUser(request, adminEmail, adminPassword)
  const response = await updateCampaignWithRetry(request, admin.token, {
    slug: campaignSlug,
    canDownloadFederal: true,
  })

  await assertOk(response, 'Admin campaign approval failed')
}

test.describe('Contacts and Segments', () => {
  let authToken: string
  let campaignSlug: string
  let testUserId: number
  let testAuthToken: string
  let electedOfficeId: string

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
    campaignSlug = registerResponse.campaign.slug
    testUserId = registerResponse.user.id
    testAuthToken = registerResponse.token

    electedOfficeId = await prepareCampaignAndOffice({
      request,
      authToken,
    })
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

  test('should block contact search for non-pro campaigns without elected office', async ({
    request,
  }) => {
    await updateElectedOffice({
      request,
      authToken,
      electedOfficeId,
      data: { isActive: false },
    })

    const response = await request.get(`/v1/contacts?search=smith`, {
      headers: AUTH_HEADER(authToken),
    })

    expect(response.status()).toBe(HttpStatus.BAD_REQUEST)
    const payload = (await response.json()) as { message?: string }
    expect(payload.message).toContain(
      'Search is only available for pro campaigns',
    )
  })

  test('should block contact download for non-pro campaigns without elected office', async ({
    request,
  }) => {
    await updateElectedOffice({
      request,
      authToken,
      electedOfficeId,
      data: { isActive: false },
    })

    const response = await request.get(`/v1/contacts/download`, {
      headers: AUTH_HEADER(authToken),
    })

    expect(response.status()).toBe(HttpStatus.BAD_REQUEST)
    const payload = (await response.json()) as { message?: string }
    expect(payload.message).toContain('Campaign is not pro')
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
    expect(stats.districtId).toBe(CONTACTS_TEST_DISTRICT.id)
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

  test('should return statewide stats when district picker is set to State and campaign is approved', async ({
    request,
  }) => {
    test.skip(
      !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
      'Requires ADMIN_EMAIL and ADMIN_PASSWORD for admin-only campaign approval',
    )

    await approveCampaignForStatewideDownload({
      request,
      campaignSlug,
    })

    await updateCampaignMine({
      request,
      authToken,
      data: {
        details: {
          state: 'AL',
          ballotLevel: 'STATE',
          office: 'Other',
          otherOffice: 'Alabama Governor',
          positionId: null,
          electionDate: '2026-11-03',
        },
        pathToVictory: {
          source: P2VSource.ElectionApi,
          p2vStatus: P2VStatus.complete,
          districtId: 'cfa28085-cf71-6c78-7605-a24b8e2d41ab',
          electionType: 'State',
          electionLocation: 'AL',
          p2vCompleteDate: '2025-09-25',
        },
      },
    })

    const response = await request.get(`/v1/contacts/stats`, {
      headers: AUTH_HEADER(authToken),
    })

    expect(response.status()).toBe(HttpStatus.OK)
    const stats = (await response.json()) as {
      districtId: string
      totalConstituents: number
      buckets: Record<string, unknown>
    }
    expect(typeof stats.districtId).toBe('string')
    expect(stats.totalConstituents).toBeGreaterThan(0)
    expect(stats).toHaveProperty('buckets')
  })

  test('should download non-empty contacts CSV for seeded district', async ({
    request,
  }) => {
    const response = await request.get(`/v1/contacts/download`, {
      headers: AUTH_HEADER(authToken),
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
