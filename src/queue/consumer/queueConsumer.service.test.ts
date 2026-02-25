import { readFileSync } from 'fs'
import { join } from 'path'
import { InternalServerErrorException } from '@nestjs/common'
import { AiContentService } from '@/campaigns/ai/content/aiContent.service'
import { CampaignsService } from '@/campaigns/services/campaigns.service'
import { CampaignTcrComplianceService } from '@/campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { ContactsService } from '@/contacts/services/contacts.service'
import { ElectedOfficeService } from '@/electedOffice/services/electedOffice.service'
import { P2VStatus } from '@/elections/types/pathToVictory.types'
import { PathToVictoryService } from '@/pathToVictory/services/pathToVictory.service'
import { PollIndividualMessageService } from '@/polls/services/pollIndividualMessage.service'
import { PollIssuesService } from '@/polls/services/pollIssues.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { UsersService } from '@/users/services/users.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { DomainsService } from '@/websites/services/domains.service'
import { Test, TestingModule } from '@nestjs/testing'
import type { Message } from '@aws-sdk/client-sqs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { PollsService } from 'src/polls/services/polls.service'
import type { PollResponseJsonRow } from '../queue.types'
import { QueueType } from '../queue.types'
import { QueueConsumerService } from './queueConsumer.service'

vi.mock('@/polls/utils/polls.utils', async (importOriginal) => ({
  ...(await importOriginal()),
  sendTevynAPIPollMessage: vi.fn(),
}))

const mockRecordCustomEvent = vi.fn()
vi.mock('src/observability/newrelic/newrelic.client', () => ({
  recordCustomEvent: (...args: unknown[]) => mockRecordCustomEvent(...args),
}))

const makeCampaign = (slug = 'test-slug') => ({
  id: 1,
  userId: 10,
  slug,
})

const makeP2V = (overrides: Record<string, unknown> = {}) => ({
  id: 100,
  data: {
    p2vAttempts: 0,
    p2vStatus: P2VStatus.waiting,
    ...overrides,
  },
})

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
      responsesLocation:
        data.responsesLocation ?? 'polls/poll-1/all_cluster_analysis.json',
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

/** Fills required fields so partial test rows satisfy PollResponseJsonRow. */
const toFullRow = (
  r: Partial<PollResponseJsonRow> & {
    phoneNumber: string
    receivedAt: string
    originalMessage: string
    clusterId: number | string
  },
): PollResponseJsonRow => ({
  atomicId: '',
  atomicMessage: '',
  pollId: '',
  theme: '',
  category: '',
  summary: '',
  sentiment: '',
  isOptOut: false,
  ...r,
})

const createPollAnalysisJson = (
  responses: Parameters<typeof toFullRow>[0][],
): string => JSON.stringify(responses.map(toFullRow))

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
    vi.stubEnv('SERVE_ANALYSIS_BUCKET_NAME', 'test-analysis-bucket')
    const mockFindUniquePoll = vi.fn().mockResolvedValue({
      id: pollId,
      electedOfficeId,
      isCompleted: false,
      scheduledDate: new Date('2020-01-01'),
      targetAudienceSize: 500,
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
                deleteMany: vi.fn().mockResolvedValue(undefined),
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
    const json = createPollAnalysisJson([
      {
        phoneNumber: '+15559999999',
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'Hello',
        clusterId: 1,
      },
    ])
    s3Service.getFile.mockResolvedValue(json)
    const message = createPollAnalysisCompleteMessage({ pollId })

    await expect(service.processMessage(message)).rejects.toThrow(
      InternalServerErrorException,
    )
    await expect(service.processMessage(message)).rejects.toThrow(
      /not found in poll/,
    )
  })

  it('creates poll issues, coalesces JSON rows by phone+receivedAt, creates messages and links by clusterId', async () => {
    const json = createPollAnalysisJson([
      {
        phoneNumber,
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'My response',
        clusterId: 4,
      },
      {
        phoneNumber,
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'My response',
        clusterId: 16,
        isOptOut: true,
      },
    ])
    s3Service.getFile.mockResolvedValue(json)
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
      pollIndividualMessage: { deleteMany: vi.fn(), createMany: vi.fn() },
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

  it('respects isOptOut true in JSON', async () => {
    const json = createPollAnalysisJson([
      {
        phoneNumber,
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'Ok',
        clusterId: 1,
        isOptOut: true,
      },
    ])
    s3Service.getFile.mockResolvedValue(json)
    const message = createPollAnalysisCompleteMessage({ pollId })

    await service.processMessage(message)

    const txCb = pollIndividualMessage.client.$transaction.mock.calls[0][0]
    const mockTx = {
      pollIndividualMessage: { deleteMany: vi.fn(), createMany: vi.fn() },
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

  it('calls markPollComplete and analytics.identify/track with issue and metadata properties', async () => {
    const json = createPollAnalysisJson([
      {
        phoneNumber,
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'Hi',
        clusterId: 1,
        isOptOut: false,
      },
    ])
    s3Service.getFile.mockResolvedValue(json)
    const issues = [
      {
        pollId,
        rank: 1 as const,
        theme: 'Infrastructure',
        summary: 'Roads and bridges need repair',
        analysis: 'Detailed analysis of infrastructure',
        responseCount: 25,
        quotes: [
          { quote: 'Fix the potholes', phone_number: '+15551111111' },
          { quote: 'Bridge is unsafe', phone_number: '+15552222222' },
        ],
      },
      {
        pollId,
        rank: 2 as const,
        theme: 'Education',
        summary: 'Schools need more funding',
        analysis: 'Detailed analysis of education',
        responseCount: 15,
        quotes: [
          { quote: 'We need better teachers', phone_number: '+15553333333' },
        ],
      },
    ]
    const message = createPollAnalysisCompleteMessage({
      pollId,
      totalResponses: 50,
      issues,
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
      expect.objectContaining({
        pollId,
        'issue 1': 'Infrastructure',
        'issue 2': 'Education',
        'issue 3': null,
        issue1Description: 'Roads and bridges need repair',
        issue1Quote1: 'Fix the potholes',
        issue1Quote2: 'Bridge is unsafe',
        issue1Quote3: '',
        issue1MentionCount: 25,
        issue2Description: 'Schools need more funding',
        issue2Quote1: 'We need better teachers',
        issue2Quote2: '',
        issue2Quote3: '',
        issue2MentionCount: 15,
        issue3Description: null,
        issue3Quote1: null,
        issue3Quote2: null,
        issue3Quote3: null,
        issue3MentionCount: null,
        pollsSent: 500,
        pollResponses: 50,
        pollResponseRate: '10.0%',
      }),
    )
  })

  it('sets pollResponseRate to 0% when totalResponses is 0', async () => {
    const json = createPollAnalysisJson([
      {
        phoneNumber,
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'STOP',
        clusterId: '',
        isOptOut: true,
      },
    ])
    s3Service.getFile.mockResolvedValue(json)
    const message = createPollAnalysisCompleteMessage({
      pollId,
      totalResponses: 0,
      issues: [],
    })

    await service.processMessage(message)

    expect(analytics.track).toHaveBeenCalledWith(
      campaignUserId,
      expect.any(String),
      expect.objectContaining({
        pollResponses: 0,
        pollResponseRate: '0%',
      }),
    )
  })

  it('processes real-data-shaped JSON (array root, clusterId number or empty string)', async () => {
    const fixturePath = join(
      __dirname,
      'fixtures',
      'all_cluster_analysis_sample.json',
    )
    const fixtureContent = readFileSync(fixturePath, 'utf-8')
    const fixturePollId = '019c29d4-81aa-733e-a72a-3983baf19a22'
    const fixturePhones = ['12088508796', '12088639774', '12817265015']

    pollsService.findUnique.mockResolvedValue({
      id: fixturePollId,
      electedOfficeId,
      isCompleted: false,
      scheduledDate: new Date('2020-01-01'),
    })
    pollIndividualMessage.findMany.mockResolvedValue(
      fixturePhones.map((phone, i) => ({
        personCellPhone: phone,
        personId: `person-fixture-${i + 1}`,
      })),
    )
    s3Service.getFile.mockResolvedValue(fixtureContent)

    const message = createPollAnalysisCompleteMessage({
      pollId: fixturePollId,
      totalResponses: 4,
      issues: [
        {
          pollId: fixturePollId,
          rank: 1,
          theme: 'T1',
          summary: 'S1',
          analysis: 'A1',
          responseCount: 1,
          quotes: [],
        },
        {
          pollId: fixturePollId,
          rank: 2,
          theme: 'T2',
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
      where: { pollId: fixturePollId },
    })
    expect(pollIndividualMessage.client.$transaction).toHaveBeenCalled()
    const txCb = pollIndividualMessage.client.$transaction.mock.calls[0][0]
    const mockTx = {
      pollIndividualMessage: { deleteMany: vi.fn(), createMany: vi.fn() },
      $executeRaw: vi.fn(),
    }
    await txCb(mockTx)
    // Fixture has 3 unique groups (phone+receivedAt): opt-out, single-row traffic, two-row community/biking
    expect(mockTx.pollIndividualMessage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          personId: 'person-fixture-1',
          content: 'STOP',
          isOptOut: true,
        }),
        expect.objectContaining({
          personId: 'person-fixture-2',
          content: 'Traffic',
          isOptOut: false,
        }),
        expect.objectContaining({
          personId: 'person-fixture-3',
          content: expect.stringContaining('Community development'),
          isOptOut: false,
        }),
      ]),
    })
    expect(
      mockTx.pollIndividualMessage.createMany.mock.calls[0][0].data,
    ).toHaveLength(3)
  })

  it('discards responses that have no clusterId and are not opt-outs', async () => {
    const json = createPollAnalysisJson([
      {
        phoneNumber,
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'irrelevant noise',
        clusterId: '',
        isOptOut: false,
      },
    ])
    s3Service.getFile.mockResolvedValue(json)
    const message = createPollAnalysisCompleteMessage({ pollId })

    const result = await service.processMessage(message)

    expect(result).toBe(true)
    const txCb = pollIndividualMessage.client.$transaction.mock.calls[0][0]
    const mockTx = {
      pollIndividualMessage: { deleteMany: vi.fn(), createMany: vi.fn() },
      $executeRaw: vi.fn(),
    }
    await txCb(mockTx)
    expect(mockTx.pollIndividualMessage.createMany).toHaveBeenCalledWith({
      data: [],
    })
  })

  it('keeps opt-out responses even when they have no clusterId', async () => {
    const json = createPollAnalysisJson([
      {
        phoneNumber,
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'STOP',
        clusterId: '',
        isOptOut: true,
      },
    ])
    s3Service.getFile.mockResolvedValue(json)
    const message = createPollAnalysisCompleteMessage({ pollId })

    await service.processMessage(message)

    const txCb = pollIndividualMessage.client.$transaction.mock.calls[0][0]
    const mockTx = {
      pollIndividualMessage: { deleteMany: vi.fn(), createMany: vi.fn() },
      $executeRaw: vi.fn(),
    }
    await txCb(mockTx)
    expect(mockTx.pollIndividualMessage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          isOptOut: true,
          content: 'STOP',
        }),
      ]),
    })
    expect(
      mockTx.pollIndividualMessage.createMany.mock.calls[0][0].data,
    ).toHaveLength(1)
    // No join records should be created for opt-out without clusterId
    expect(mockTx.$executeRaw).not.toHaveBeenCalled()
  })

  it('saves responses with a clusterId outside the top 3 but without a poll issue link', async () => {
    const json = createPollAnalysisJson([
      {
        phoneNumber,
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'My niche concern',
        clusterId: 5,
        isOptOut: false,
      },
    ])
    s3Service.getFile.mockResolvedValue(json)
    const message = createPollAnalysisCompleteMessage({
      pollId,
      issues: [
        {
          pollId,
          rank: 1,
          theme: 'Top issue',
          summary: 'S1',
          analysis: 'A1',
          responseCount: 3,
          quotes: [],
        },
      ],
    })

    await service.processMessage(message)

    const txCb = pollIndividualMessage.client.$transaction.mock.calls[0][0]
    const mockTx = {
      pollIndividualMessage: { deleteMany: vi.fn(), createMany: vi.fn() },
      $executeRaw: vi.fn(),
    }
    await txCb(mockTx)
    // The individual message is still created
    expect(
      mockTx.pollIndividualMessage.createMany.mock.calls[0][0].data,
    ).toHaveLength(1)
    expect(mockTx.pollIndividualMessage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          content: 'My niche concern',
        }),
      ]),
    })
    // But no join record is created since clusterId 5 is not in the top 3
    expect(mockTx.$executeRaw).not.toHaveBeenCalled()
  })

  it('is idempotent: processing the same poll analysis complete event twice succeeds both times', async () => {
    const json = createPollAnalysisJson([
      {
        phoneNumber,
        receivedAt: '2024-01-15T10:00:00Z',
        originalMessage: 'Same response',
        clusterId: 1,
      },
    ])
    s3Service.getFile.mockResolvedValue(json)
    const message = createPollAnalysisCompleteMessage({ pollId })

    const first = await service.processMessage(message)
    const second = await service.processMessage(message)

    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(pollIndividualMessage.client.$transaction).toHaveBeenCalledTimes(2)

    const txCb = pollIndividualMessage.client.$transaction.mock.calls[0][0]
    const mockTx = {
      pollIndividualMessage: { deleteMany: vi.fn(), createMany: vi.fn() },
      $executeRaw: vi.fn(),
    }
    await txCb(mockTx)
    expect(mockTx.pollIndividualMessage.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: expect.any(Array) },
        pollId,
        sender: expect.anything(),
      },
    })
    const deleteWhere =
      mockTx.pollIndividualMessage.deleteMany.mock.calls[0][0].where
    expect(deleteWhere.id.in).toHaveLength(1)
    expect(mockTx.pollIndividualMessage.createMany).toHaveBeenCalled()
  })

  describe('QueueConsumerService - P2V handling', () => {
    let service: QueueConsumerService
    let mockP2vService: {
      handlePathToVictory: ReturnType<typeof vi.fn>
      analyzePathToVictoryResponse: ReturnType<typeof vi.fn>
      findUniqueOrThrow: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }
    let mockSlack: {
      message: ReturnType<typeof vi.fn>
      errorMessage: ReturnType<typeof vi.fn>
      formattedMessage: ReturnType<typeof vi.fn>
    }
    let mockCampaigns: {
      findUnique: ReturnType<typeof vi.fn>
      findUniqueOrThrow: ReturnType<typeof vi.fn>
    }

    beforeEach(async () => {
      mockP2vService = {
        handlePathToVictory: vi.fn(),
        analyzePathToVictoryResponse: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      }
      mockSlack = {
        message: vi.fn().mockResolvedValue(undefined),
        errorMessage: vi.fn().mockResolvedValue(undefined),
        formattedMessage: vi.fn().mockResolvedValue(undefined),
      }
      mockCampaigns = {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          QueueConsumerService,
          { provide: AiContentService, useValue: {} },
          { provide: SlackService, useValue: mockSlack },
          { provide: PathToVictoryService, useValue: mockP2vService },
          {
            provide: AnalyticsService,
            useValue: {
              track: vi.fn().mockResolvedValue(undefined),
              identify: vi.fn().mockResolvedValue(undefined),
            },
          },
          { provide: CampaignsService, useValue: mockCampaigns },
          { provide: CampaignTcrComplianceService, useValue: {} },
          { provide: DomainsService, useValue: {} },
          { provide: PollsService, useValue: {} },
          { provide: PollIssuesService, useValue: {} },
          { provide: PollIndividualMessageService, useValue: {} },
          { provide: ElectedOfficeService, useValue: {} },
          { provide: ContactsService, useValue: {} },
          { provide: S3Service, useValue: {} },
          { provide: UsersService, useValue: {} },
        ],
      }).compile()

      service = module.get<QueueConsumerService>(QueueConsumerService)

      const mockLogger = createMockLogger()
      Object.defineProperty(service, 'logger', {
        get: () => mockLogger,
        configurable: true,
      })

      vi.clearAllMocks()
    })

    describe('handlePathToVictoryFailure', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let handleFailure: (
        campaign: ReturnType<typeof makeCampaign>,
      ) => Promise<boolean>

      beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handleFailure = (service as any).handlePathToVictoryFailure.bind(
          service,
        )
      })

      it('returns true (requeue) and increments p2vAttempts when < 3 attempts', async () => {
        mockP2vService.findUniqueOrThrow.mockResolvedValue(
          makeP2V({ p2vAttempts: 1, p2vStatus: P2VStatus.districtMatched }),
        )

        const result = await handleFailure(makeCampaign())

        expect(result).toBe(true)
        const updateData = mockP2vService.update.mock.calls[0][0].data.data
        expect(updateData.p2vAttempts).toBe(2)
        // Should NOT mark as failed or send Slack
        expect(updateData.p2vStatus).toBe(P2VStatus.districtMatched)
        expect(mockSlack.message).not.toHaveBeenCalled()
      })

      it('returns false and marks Failed when exhausted retries and status is Waiting', async () => {
        mockP2vService.findUniqueOrThrow.mockResolvedValue(
          makeP2V({ p2vAttempts: 2, p2vStatus: P2VStatus.waiting }),
        )

        const result = await handleFailure(makeCampaign())

        expect(result).toBe(false)
        const updateData = mockP2vService.update.mock.calls[0][0].data.data
        expect(updateData.p2vAttempts).toBe(3)
        expect(updateData.p2vStatus).toBe(P2VStatus.failed)
        expect(mockSlack.message).toHaveBeenCalled()
        expect(mockRecordCustomEvent).toHaveBeenCalled()
      })

      it('returns false and preserves DistrictMatched when exhausted retries', async () => {
        mockP2vService.findUniqueOrThrow.mockResolvedValue(
          makeP2V({ p2vAttempts: 2, p2vStatus: P2VStatus.districtMatched }),
        )

        const result = await handleFailure(makeCampaign())

        expect(result).toBe(false)
        const updateData = mockP2vService.update.mock.calls[0][0].data.data
        expect(updateData.p2vAttempts).toBe(3)
        // Status preserved — gold's DistrictMatched is NOT overwritten to Failed
        expect(updateData.p2vStatus).toBe(P2VStatus.districtMatched)
        expect(mockSlack.message).not.toHaveBeenCalled()
        expect(mockRecordCustomEvent).not.toHaveBeenCalled()
      })
    })

    describe('handlePathToVictoryMessage (via processMessage)', () => {
      const makeQueueMessage = () => ({
        Body: JSON.stringify({
          type: 'pathToVictory',
          data: {
            slug: 'test-slug',
            campaignId: '1',
            officeName: 'City Council',
            electionDate: '2024-11-05',
            electionTerm: 4,
            electionLevel: 'local',
            electionState: 'CA',
            electionCounty: 'Los Angeles',
            electionMunicipality: 'Los Angeles',
            partisanType: 'nonpartisan',
            priorElectionDates: [],
          },
        }),
      })

      const mockP2VResponse = {
        slug: 'test-slug',
        pathToVictoryResponse: {
          electionType: '',
          electionLocation: '',
          district: '',
          counts: { projectedTurnout: 0, winNumber: 0, voterContactGoal: 0 },
        },
        officeName: 'City Council',
        electionDate: '2024-11-05',
        electionTerm: 4,
        electionLevel: 'local',
        electionState: 'CA',
        electionCounty: 'Los Angeles',
        electionMunicipality: 'Los Angeles',
        partisanType: 'nonpartisan',
        priorElectionDates: [],
      }

      it('does not throw when failure handler returns false (already matched)', async () => {
        mockP2vService.handlePathToVictory.mockResolvedValue(mockP2VResponse)
        mockCampaigns.findUnique.mockResolvedValue({
          ...makeCampaign(),
          pathToVictory: { id: 100, data: {} },
        })
        mockP2vService.analyzePathToVictoryResponse.mockResolvedValue(false)
        // handlePathToVictoryFailure returns false (don't requeue)
        mockP2vService.findUniqueOrThrow.mockResolvedValue(
          makeP2V({
            p2vAttempts: 2,
            p2vStatus: P2VStatus.districtMatched,
          }),
        )

        // withLegacyErrorSwallowing: no throw → returns true (message processed)
        const result = await service.processMessage(makeQueueMessage() as never)

        expect(result).toBe(true)
      })
    })
  })
})

describe('QueueConsumerService - triggerPollExecution', () => {
  let service: QueueConsumerService
  let pollsService: {
    findUnique: ReturnType<typeof vi.fn>
    client: {
      $transaction: ReturnType<typeof vi.fn>
      pollIndividualMessage: { findMany: ReturnType<typeof vi.fn> }
    }
  }
  let electedOfficeService: { findUnique: ReturnType<typeof vi.fn> }
  let campaignsService: { findUnique: ReturnType<typeof vi.fn> }
  let contactsService: { sampleContacts: ReturnType<typeof vi.fn> }
  let s3Service: {
    getFile: ReturnType<typeof vi.fn>
    buildKey: ReturnType<typeof vi.fn>
    uploadFile: ReturnType<typeof vi.fn>
  }
  let usersService: { findUnique: ReturnType<typeof vi.fn> }
  let mockUpsert: ReturnType<typeof vi.fn>

  const pollId = 'poll-456'
  const electedOfficeId = 'office-1'
  const campaignId = 1

  const makePoll = (overrides: Record<string, unknown> = {}) => ({
    id: pollId,
    electedOfficeId,
    isCompleted: false,
    scheduledDate: new Date('2020-01-01'),
    estimatedCompletionDate: new Date('2020-01-04'),
    targetAudienceSize: 500,
    messageContent: 'What issues matter to you?',
    imageUrl: null,
    ...overrides,
  })

  beforeEach(() => {
    vi.stubEnv('TEVYN_POLL_CSVS_BUCKET', 'test-csv-bucket')
    mockUpsert = vi.fn().mockResolvedValue(undefined)

    pollsService = {
      findUnique: vi.fn().mockResolvedValue(makePoll()),
      client: {
        $transaction: vi
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
            const mockTx = {
              pollIndividualMessage: { upsert: mockUpsert },
            }
            return fn(mockTx)
          }),
        pollIndividualMessage: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    }
    electedOfficeService = {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: electedOfficeId, campaignId }),
    }
    campaignsService = {
      findUnique: vi.fn().mockResolvedValue({
        id: campaignId,
        userId: 'user-1',
        pathToVictory: { data: { electionLocation: 'Test District' } },
      }),
    }
    contactsService = {
      sampleContacts: vi.fn().mockResolvedValue([
        {
          id: 'person-1',
          firstName: 'Alice',
          lastName: 'Smith',
          cellPhone: '+15551111111',
        },
        {
          id: 'person-2',
          firstName: 'Bob',
          lastName: 'Jones',
          cellPhone: '+15552222222',
        },
      ]),
    }
    s3Service = {
      getFile: vi.fn().mockResolvedValue(null),
      buildKey: vi.fn().mockReturnValue('test-key.csv'),
      uploadFile: vi.fn().mockResolvedValue(undefined),
    }
    usersService = {
      findUnique: vi.fn().mockResolvedValue({
        id: 'user-1',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@test.com',
        phone: null,
      }),
    }

    service = new QueueConsumerService(
      {} as never,
      { client: {} } as never,
      {} as never,
      {} as never,
      campaignsService as never,
      {} as never,
      {} as never,
      pollsService as never,
      {} as never,
      {} as never,
      electedOfficeService as never,
      contactsService as never,
      s3Service as never,
      usersService as never,
    )
    Object.defineProperty(service, 'logger', {
      get: () => createMockLogger(),
      configurable: true,
    })
  })

  it('handlePollCreation creates ELECTED_OFFICIAL records with electedOfficeId', async () => {
    const message: Message = {
      MessageId: 'msg-creation',
      Body: JSON.stringify({
        type: QueueType.POLL_CREATION,
        data: { pollId },
      }),
    }

    await service.processMessage(message)

    expect(mockUpsert).toHaveBeenCalledTimes(2)
    for (const call of mockUpsert.mock.calls) {
      const createData = call[0].create
      expect(createData).toMatchObject({
        pollId,
        electedOfficeId,
      })
      expect(createData.personCellPhone).toMatch(/^\+1\d{10}$/)
    }
  })

  it('handlePollExpansion only counts ELECTED_OFFICIAL records for alreadySent', async () => {
    const existingRecords = [
      { personId: 'person-existing-1' },
      { personId: 'person-existing-2' },
    ]
    pollsService.client.pollIndividualMessage.findMany.mockResolvedValue(
      existingRecords,
    )
    pollsService.findUnique.mockResolvedValue(
      makePoll({ targetAudienceSize: 1000 }),
    )

    const message: Message = {
      MessageId: 'msg-expansion',
      Body: JSON.stringify({
        type: QueueType.POLL_EXPANSION,
        data: { pollId },
      }),
    }

    await service.processMessage(message)

    // Verify the alreadySent query filters by ELECTED_OFFICIAL sender
    expect(
      pollsService.client.pollIndividualMessage.findMany,
    ).toHaveBeenCalledWith({
      where: {
        pollId,
        sender: 'ELECTED_OFFICIAL',
      },
      select: { personId: true },
    })

    // Verify sampleContacts receives correct size and excludeIds
    expect(contactsService.sampleContacts).toHaveBeenCalledWith(
      {
        size: 1000 - existingRecords.length,
        excludeIds: ['person-existing-1', 'person-existing-2'],
      },
      expect.anything(),
    )
  })
})
