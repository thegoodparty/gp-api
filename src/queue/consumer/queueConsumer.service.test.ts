import { InternalServerErrorException } from '@nestjs/common'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueueType } from '../queue.types'
import { QueueConsumerService } from './queueConsumer.service'
import type { Message } from '@aws-sdk/client-sqs'
import type { AnalyticsService } from 'src/analytics/analytics.service'
import type { PollsService } from 'src/polls/services/polls.service'

vi.mock('@/polls/utils/polls.utils', () => ({
  sendTevynAPIPollMessage: vi.fn(),
}))

const createPollAnalysisCompleteMessage = (data: {
  pollId: string
  totalResponses?: number
  responsesLocation?: string
  issues?: Array<{
    pollId: string
    rank: number
    theme: string
    summary: string
    analysis: string
    responseCount: number
    quotes: Array<{ quote: string; phone_number: string }>
  }>
}): Message => ({
  MessageId: 'msg-1',
  Body: JSON.stringify({
    type: QueueType.POLL_ANALYSIS_COMPLETE,
    data: {
      pollId: data.pollId,
      totalResponses: data.totalResponses ?? 10,
      responsesLocation: data.responsesLocation ?? 'polls/poll-1/responses.csv',
      issues: data.issues ?? [
        {
          pollId: data.pollId,
          rank: 1,
          theme: 'Theme A',
          summary: 'Summary A',
          analysis: 'Analysis A',
          responseCount: 5,
          quotes: [{ quote: 'Q1', phone_number: '+15551234567' }],
        },
      ],
    },
  }),
})

const createCsv = (rows: Record<string, string>[]) => {
  const headers = Object.keys(rows[0] ?? {}).join(',')
  const lines = rows.map((r) => Object.values(r).join(','))
  return [headers, ...lines].join('\n')
}

describe('QueueConsumerService - handlePollAnalysisComplete', () => {
  let service: QueueConsumerService
  let pollsService: {
    findUnique: ReturnType<typeof vi.fn>
    markPollComplete: ReturnType<typeof vi.fn>
    model: { count: ReturnType<typeof vi.fn> }
  }
  let electedOfficeService: { findUnique: ReturnType<typeof vi.fn> }
  let campaignsService: { findUnique: ReturnType<typeof vi.fn> }
  let contactsService: { findContacts: ReturnType<typeof vi.fn> }
  let pollIssuesService: {
    model: { deleteMany: ReturnType<typeof vi.fn> }
    client: { pollIssue: { createMany: ReturnType<typeof vi.fn> } }
  }
  let s3Service: { getFile: ReturnType<typeof vi.fn> }
  let pollIndividualMessage: {
    findMany: ReturnType<typeof vi.fn>
    client: { $transaction: ReturnType<typeof vi.fn> }
  }
  let analytics: {
    identify: ReturnType<typeof vi.fn>
    track: ReturnType<typeof vi.fn>
  }

  const pollId = 'poll-123'
  const electedOfficeId = 'office-1'
  const campaignId = 1
  const campaignUserId = 'user-1'
  const personId = 'person-1'
  const phoneNumber = '+15551234567'

  beforeEach(() => {
    vi.stubEnv('SERVE_DATA_S3_BUCKET', 'test-bucket')
    const mockFindUniquePoll = vi.fn().mockResolvedValue({
      id: pollId,
      electedOfficeId,
      isCompleted: false,
      scheduledDate: new Date('2020-01-01'),
    })
    pollsService = {
      findUnique: mockFindUniquePoll,
      markPollComplete: vi.fn().mockResolvedValue(undefined),
      model: { count: vi.fn().mockResolvedValue(1) },
    }
    electedOfficeService = {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: electedOfficeId, campaignId }),
    }
    campaignsService = {
      findUnique: vi.fn().mockResolvedValue({
        id: campaignId,
        userId: campaignUserId,
        pathToVictory: { data: { electionLocation: 'Test District' } },
      }),
    }
    contactsService = {
      findContacts: vi
        .fn()
        .mockResolvedValue({ pagination: { totalResults: 100 } }),
    }
    pollIssuesService = {
      model: { deleteMany: vi.fn().mockResolvedValue(undefined) },
      client: {
        pollIssue: { createMany: vi.fn().mockResolvedValue(undefined) },
      },
    }
    s3Service = { getFile: vi.fn() }
    pollIndividualMessage = {
      findMany: vi
        .fn()
        .mockResolvedValue([{ personCellPhone: phoneNumber, personId }]),
      client: {
        $transaction: vi
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
            const mockTx = {
              pollIndividualMessage: {
                createMany: vi.fn().mockResolvedValue(undefined),
              },
              $executeRaw: vi.fn().mockResolvedValue(undefined),
            }
            return fn(mockTx)
          }),
      },
    }
    analytics = {
      identify: vi.fn().mockResolvedValue(undefined),
      track: vi.fn().mockResolvedValue(undefined),
    }

    service = new QueueConsumerService(
      {} as never,
      {} as never,
      {} as never,
      analytics as unknown as AnalyticsService,
      campaignsService as never,
      {} as never,
      {} as never,
      pollsService as unknown as PollsService,
      pollIssuesService as never,
      pollIndividualMessage as never,
      electedOfficeService as never,
      contactsService as never,
      s3Service as never,
      {} as never,
    )
    Object.defineProperty(service, 'logger', {
      get: () => createMockLogger(),
      configurable: true,
    })
  })

  it('returns undefined and does not create messages when poll is not found', async () => {
    pollsService.findUnique.mockResolvedValue(null)
    const message = createPollAnalysisCompleteMessage({ pollId })

    const result = await service.processMessage(message)

    expect(result).toBeUndefined()
    expect(s3Service.getFile).not.toHaveBeenCalled()
    expect(pollIssuesService.model.deleteMany).not.toHaveBeenCalled()
  })

  it('returns undefined and does not create messages when poll is not SCHEDULED or IN_PROGRESS', async () => {
    pollsService.findUnique.mockResolvedValue({
      id: pollId,
      electedOfficeId,
      isCompleted: true,
      scheduledDate: new Date('2020-01-01'),
    })
    const message = createPollAnalysisCompleteMessage({ pollId })

    const result = await service.processMessage(message)

    expect(result).toBeUndefined()
    expect(s3Service.getFile).not.toHaveBeenCalled()
  })

  it('throws when S3 getFile returns null', async () => {
    s3Service.getFile.mockResolvedValue(null)
    const message = createPollAnalysisCompleteMessage({ pollId })

    await expect(service.processMessage(message)).rejects.toThrow(
      InternalServerErrorException,
    )
    await expect(service.processMessage(message)).rejects.toThrow(
      /Unable to fetch responses from S3/,
    )
  })

  it('throws when person with cell phone is not found in poll', async () => {
    pollIndividualMessage.findMany.mockResolvedValue([])
    const csv = createCsv([
      {
        atomicId: 'a1',
        phoneNumber: '+15559999999',
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'Hello',
        atomicMessage: 'Hello',
        pollId,
        clusterId: '1',
        theme: 'T',
        category: 'C',
        summary: 'S',
        sentiment: 'pos',
        isOptOut: 'false',
      },
    ])
    s3Service.getFile.mockResolvedValue(csv)
    const message = createPollAnalysisCompleteMessage({ pollId })

    await expect(service.processMessage(message)).rejects.toThrow(
      InternalServerErrorException,
    )
    await expect(service.processMessage(message)).rejects.toThrow(
      /not found in poll/,
    )
  })

  it('creates poll issues, coalesces CSV rows by phone+receivedAt, creates messages and links by clusterId', async () => {
    const csv = createCsv([
      {
        atomicId: 'a1',
        phoneNumber,
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'My response',
        atomicMessage: 'Part 1',
        pollId,
        clusterId: '1',
        theme: 'T1',
        category: 'C1',
        summary: 'S1',
        sentiment: 'pos',
        isOptOut: 'false',
      },
      {
        atomicId: 'a2',
        phoneNumber,
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'My response',
        atomicMessage: 'Part 2',
        pollId,
        clusterId: '2',
        theme: 'T2',
        category: 'C2',
        summary: 'S2',
        sentiment: 'pos',
        isOptOut: 'true',
      },
    ])
    s3Service.getFile.mockResolvedValue(csv)
    const message = createPollAnalysisCompleteMessage({
      pollId,
      issues: [
        {
          pollId,
          rank: 1,
          theme: 'Theme 1',
          summary: 'S1',
          analysis: 'A1',
          responseCount: 1,
          quotes: [],
        },
        {
          pollId,
          rank: 2,
          theme: 'Theme 2',
          summary: 'S2',
          analysis: 'A2',
          responseCount: 1,
          quotes: [],
        },
      ],
    })

    const result = await service.processMessage(message)

    expect(result).toBe(true)
    expect(pollIssuesService.model.deleteMany).toHaveBeenCalledWith({
      where: { pollId },
    })
    expect(pollIssuesService.client.pollIssue.createMany).toHaveBeenCalled()
    expect(pollIndividualMessage.client.$transaction).toHaveBeenCalled()
    const txCb = pollIndividualMessage.client.$transaction.mock.calls[0][0]
    const mockTx = {
      pollIndividualMessage: { createMany: vi.fn() },
      $executeRaw: vi.fn(),
    }
    await txCb(mockTx)
    expect(mockTx.pollIndividualMessage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          personId,
          pollId,
          electedOfficeId,
          content: 'My response',
          isOptOut: true,
        }),
      ]),
    })
  })

  it('coerces isOptOut via toBoolean (yes/1/true)', async () => {
    const csv = createCsv([
      {
        atomicId: 'a1',
        phoneNumber,
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'Ok',
        atomicMessage: 'Ok',
        pollId,
        clusterId: '1',
        theme: 'T',
        category: 'C',
        summary: 'S',
        sentiment: 'pos',
        isOptOut: 'yes',
      },
    ])
    s3Service.getFile.mockResolvedValue(csv)
    const message = createPollAnalysisCompleteMessage({ pollId })

    await service.processMessage(message)

    const txCb = pollIndividualMessage.client.$transaction.mock.calls[0][0]
    const mockTx = {
      pollIndividualMessage: { createMany: vi.fn() },
      $executeRaw: vi.fn(),
    }
    await txCb(mockTx)
    expect(mockTx.pollIndividualMessage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          isOptOut: true,
        }),
      ]),
    })
  })

  it('calls markPollComplete and analytics.identify/track', async () => {
    const csv = createCsv([
      {
        atomicId: 'a1',
        phoneNumber,
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'Hi',
        atomicMessage: 'Hi',
        pollId,
        clusterId: '1',
        theme: 'T',
        category: 'C',
        summary: 'S',
        sentiment: 'pos',
        isOptOut: 'false',
      },
    ])
    s3Service.getFile.mockResolvedValue(csv)
    const message = createPollAnalysisCompleteMessage({
      pollId,
      totalResponses: 50,
    })

    await service.processMessage(message)

    expect(pollsService.markPollComplete).toHaveBeenCalledWith({
      pollId,
      totalResponses: 50,
      confidence: expect.any(String),
    })
    expect(analytics.identify).toHaveBeenCalledWith(
      campaignUserId,
      expect.objectContaining({ pollcount: expect.any(Number) }),
    )
    expect(analytics.track).toHaveBeenCalledWith(
      campaignUserId,
      expect.any(String),
      expect.objectContaining({ pollId }),
    )
  })
})
