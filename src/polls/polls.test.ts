import { StatsResponse } from '@/contacts/contacts.types'
import { ContactsService } from '@/contacts/services/contacts.service'
import { useTestService } from '@/test-service'
import { Poll } from '@prisma/client'
import { v7 as uuidv7 } from 'uuid'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PollBiasAnalysisService } from './services/pollBiasAnalysis.service'

const service = useTestService()

const getStats = vi.fn(ContactsService.prototype.getDistrictStats)

let eoOrgSlug: string

beforeEach(async () => {
  const campaignId = 8888
  const organizationSlug = `campaign-${campaignId}`

  await service.prisma.organization.create({
    data: {
      slug: organizationSlug,
      ownerId: service.user.id,
      positionId: 'gp-position-1',
    },
  })

  const campaign = await service.prisma.campaign.create({
    data: {
      id: campaignId,
      organizationSlug,
      userId: service.user.id,
      slug: 'test-campaign',
      details: {
        state: 'WY',
      },
    },
  })

  const electedOfficeId = uuidv7()
  eoOrgSlug = `eo-${electedOfficeId}`
  await service.prisma.organization.create({
    data: { slug: eoOrgSlug, ownerId: service.user.id },
  })
  await service.prisma.electedOffice.create({
    data: {
      id: electedOfficeId,
      userId: service.user.id,
      campaignId: campaign.id,
      organizationSlug: eoOrgSlug,
    },
  })

  getStats.mockResolvedValue({
    totalConstituentsWithCellPhone: 1000,
  } as StatsResponse)

  const contacts = service.app.get(ContactsService)
  vi.spyOn(contacts, 'getDistrictStats').mockImplementation(getStats)
})

describe('POST /polls/initial-poll', () => {
  const eoHeaders = () => ({
    headers: { 'x-organization-slug': eoOrgSlug },
  })

  it.each([{ message: '', swornInDate: '2025-01-01' }])(
    'blocks bad input',
    async (payload) => {
      const result = await service.client.post(
        '/v1/polls/initial-poll',
        payload,
        eoHeaders(),
      )
      expect(result).toMatchObject({
        status: 400,
        data: { message: 'Validation failed' },
      })
    },
  )

  it('fails if total constituents is less than 500', async () => {
    getStats.mockResolvedValue({
      totalConstituents: 499,
      totalConstituentsWithCellPhone: 499,
    } as StatsResponse)
    const result = await service.client.post(
      '/v1/polls/initial-poll',
      {
        message: 'This is a test message',
        swornInDate: '2025-01-01',
      },
      eoHeaders(),
    )
    expect(result).toMatchObject({
      status: 400,
      data: {
        message:
          'You need at least 500 constituents with cell phones to create a poll.',
      },
    })
  })

  it('creates a poll when campaign has no positionId', async () => {
    await service.prisma.campaign.updateMany({
      where: { userId: service.user.id },
      data: { details: {} },
    })

    const result = await service.client.post(
      '/v1/polls/initial-poll',
      {
        message: 'This is a test message',
        swornInDate: '2025-01-01',
      },
      eoHeaders(),
    )

    expect(result).toMatchObject({
      status: 201,
      data: {
        id: expect.any(String),
      },
    })
  })

  it('creates a poll', async () => {
    const result = await service.client.post(
      '/v1/polls/initial-poll',
      {
        message: 'This is a test message',
        swornInDate: '2025-01-01',
      },
      eoHeaders(),
    )

    expect(result).toMatchObject({
      status: 201,
      data: {
        id: expect.any(String),
      },
    })

    // Appears in list
    const fetched = await service.client.get<{ results: Poll[] }>(
      `/v1/polls`,
      eoHeaders(),
    )
    expect(fetched.data.results).toContainEqual(
      expect.objectContaining({ id: result.data.id }),
    )

    // Can be fetched by ID
    const fetchedById = await service.client.get(
      `/v1/polls/${result.data.id}`,
      eoHeaders(),
    )
    expect(fetchedById).toMatchObject({
      status: 200,
      data: result.data,
    })
  })
})

describe('POST /polls/analyze-bias', () => {
  let pollBiasAnalysisService: PollBiasAnalysisService

  beforeEach(() => {
    pollBiasAnalysisService = service.app.get(PollBiasAnalysisService)
  })

  it('returns bias analysis response', async () => {
    const mockResponse = {
      bias_spans: [
        {
          start: 0,
          end: 5,
          reason: 'bias',
          suggestion: 'neutral term',
        },
      ],
      grammar_spans: [],
      rewritten_text: 'Neutral text',
    }

    const spy = vi
      .spyOn(pollBiasAnalysisService, 'analyzePollText')
      .mockResolvedValue(mockResponse)

    const result = await service.client.post('/v1/polls/analyze-bias', {
      pollText: 'Test poll text',
    })

    expect(result).toMatchObject({
      status: 201,
      data: mockResponse,
    })
    expect(spy).toHaveBeenCalledWith(
      'Test poll text',
      service.user.id.toString(),
    )
  })
})
