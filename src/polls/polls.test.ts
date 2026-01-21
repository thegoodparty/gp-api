import { useTestService } from '@/test-service'
import { Poll } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PollBiasAnalysisService } from './services/pollBiasAnalysis.service'

const service = useTestService()

beforeEach(async () => {
  await service.prisma.campaign.create({
    data: {
      userId: service.user.id,
      slug: 'test-campaign',
    },
  })
})

describe('POST /polls/initial-poll', () => {
  it.each([
    { message: '', swornInDate: '2025-01-01' },
    { message: '', swornInDate: '2025-01-01' },
  ])('blocks bad input', async (payload) => {
    const result = await service.client.post('/v1/polls/initial-poll', payload)
    expect(result).toMatchObject({
      status: 400,
      data: { message: 'Validation failed' },
    })
  })

  it('creates a poll', async () => {
    const result = await service.client.post('/v1/polls/initial-poll', {
      message: 'This is a test message',
      swornInDate: '2025-01-01',
    })

    expect(result).toMatchObject({
      status: 201,
      data: {
        id: expect.any(String),
      },
    })

    // Appears in list
    const fetched = await service.client.get<{ results: Poll[] }>(`/v1/polls`)
    expect(fetched.data.results).toContainEqual(
      expect.objectContaining({ id: result.data.id }),
    )

    // Can be fetched by ID
    const fetchedById = await service.client.get(`/v1/polls/${result.data.id}`)
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
