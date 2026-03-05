import { HttpStatus } from '@nestjs/common'
import { expect, test } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { P2VStatus } from '../../elections/types/pathToVictory.types'
import { P2VSource } from '../../pathToVictory/types/pathToVictory.types'
import {
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  registerUser,
} from '../../../e2e-tests/utils/auth.util'

const prisma = new PrismaClient()

const CONTACTS_TEST_DISTRICT = {
  id: '0e5bafca-93a9-86a5-2522-f373979720df',
  type: 'City_Ward',
  name: 'CHEYENNE CITY WARD 1',
  state: 'WY',
} as const

const AUTH_HEADER = (token: string) => ({
  Authorization: `Bearer ${token}`,
})

async function prepareCampaignAndOffice(params: {
  campaignId: number
  userId: number
}) {
  const { campaignId, userId } = params

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      isPro: true,
      details: {
        state: CONTACTS_TEST_DISTRICT.state,
        zip: '82001',
        office: 'Other',
        otherOffice: 'Cheyenne City Council Ward 1',
        positionId: 'seed-position-cheyenne-city-ward-1',
        electionDate: '2026-11-03',
        ballotLevel: 'CITY',
      },
    },
  })

  await prisma.pathToVictory.upsert({
    where: { campaignId },
    create: {
      campaignId,
      data: {
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
    update: {
      data: {
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

  const existingOffice = await prisma.electedOffice.findFirst({
    where: { campaignId, userId },
    select: { id: true },
  })

  if (existingOffice) {
    await prisma.electedOffice.update({
      where: { id: existingOffice.id },
      data: {
        isActive: true,
        electedDate: new Date('2024-11-05'),
        swornInDate: new Date('2025-01-01'),
      },
    })
  } else {
    await prisma.electedOffice.create({
      data: {
        campaignId,
        userId,
        isActive: true,
        electedDate: new Date('2024-11-05'),
        swornInDate: new Date('2025-01-01'),
      },
    })
  }
}

test.describe('Contacts and Segments', () => {
  let authToken: string
  let campaignId: number
  let testUserId: number
  let testAuthToken: string

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
    campaignId = registerResponse.campaign.id
    testUserId = registerResponse.user.id
    testAuthToken = registerResponse.token

    await prepareCampaignAndOffice({
      campaignId,
      userId: registerResponse.user.id,
    })
  })

  test.afterEach(async ({ request }) => {
    if (testUserId && testAuthToken) {
      await deleteUser(request, testUserId, testAuthToken)
    }
  })

  test.afterAll(async () => {
    await prisma.$disconnect()
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
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { isPro: false },
    })
    await prisma.electedOffice.deleteMany({
      where: { campaignId, userId: testUserId },
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
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { isPro: false },
    })
    await prisma.electedOffice.deleteMany({
      where: { campaignId, userId: testUserId },
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
