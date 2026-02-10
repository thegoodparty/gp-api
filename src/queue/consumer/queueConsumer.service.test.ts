import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { Message } from '@aws-sdk/client-sqs'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { AiContentService } from 'src/campaigns/ai/content/aiContent.service'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { ContactsService } from 'src/contacts/services/contacts.service'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import { PollIndividualMessageService } from 'src/polls/services/pollIndividualMessage.service'
import { PollIssuesService } from 'src/polls/services/pollIssues.service'
import { PollsService } from 'src/polls/services/polls.service'
import { S3Service } from 'src/vendors/aws/services/s3.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { PathToVictoryService } from 'src/pathToVictory/services/pathToVictory.service'
import { CampaignTcrComplianceService } from 'src/campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { DomainsService } from 'src/websites/services/domains.service'
import { UsersService } from 'src/users/services/users.service'
import { QueueType } from '../queue.types'
import { QueueConsumerService } from './queueConsumer.service'
import { PollIndividualMessageSender } from '@prisma/client'

/**
 * Testing handlePollAnalysisComplete (and other queue handlers) without SQS:
 *
 * We don't need a real SQS queue. The consumer's public handleMessageAndMaybeRequeue(message)
 * accepts an SQS Message; we build a fake Message with Body set to the JSON payload and
 * call that method. All I/O (S3, DB, etc.) is mocked, so the test is a unit test of the
 * handler logic. The app already excludes QueueConsumerModule in test env (app.module.ts).
 */

const POLL_ID = 'poll-1'
const ELECTED_OFFICE_ID = 'office-1'
const CAMPAIGN_ID = 'campaign-1'
const USER_ID = 'user-1'
const RESPONSES_LOCATION = 'polls/poll-1/responses.csv'

const validPollAnalysisCompleteBody = {
  type: QueueType.POLL_ANALYSIS_COMPLETE,
  data: {
    pollId: POLL_ID,
    totalResponses: 2,
    responsesLocation: RESPONSES_LOCATION,
    issues: [
      {
        pollId: POLL_ID,
        rank: 1,
        theme: 'Theme A',
        summary: 'Summary A',
        analysis: 'Analysis A',
        responseCount: 10,
        quotes: [{ quote: 'Quote 1', phone_number: '+15551234567' }],
      },
    ],
  },
}

/** CSV with headers matching PollResponseCSV (snake_case); parsed and camelCased by handler */
const minimalResponsesCsv = `phone_number,original_message,k2_theme
+15551234567,Hello,Some Theme`

function makeSqsMessage(body: object): Message {
  return {
    MessageId: 'msg-1',
    Body: JSON.stringify(body),
  }
}

describe('QueueConsumerService - handlePollAnalysisComplete', () => {
  let service: QueueConsumerService
  let mockPollsService: {
    findUnique: ReturnType<typeof vi.fn>
    markPollComplete: ReturnType<typeof vi.fn>
    model: { count: ReturnType<typeof vi.fn> }
  }
  let mockElectedOfficeService: { findUnique: ReturnType<typeof vi.fn> }
  let mockCampaignsService: { findUnique: ReturnType<typeof vi.fn> }
  let mockContactsService: { findContacts: ReturnType<typeof vi.fn> }
  let mockPollIssuesService: {
    model: { deleteMany: ReturnType<typeof vi.fn> }
    client: { pollIssue: { createMany: ReturnType<typeof vi.fn> } }
  }
  let mockPollIndividualMessage: {
    findMany: ReturnType<typeof vi.fn>
    createMany: ReturnType<typeof vi.fn>
  }
  let mockS3Service: { getFile: ReturnType<typeof vi.fn> }
  let mockAnalytics: {
    identify: ReturnType<typeof vi.fn>
    track: ReturnType<typeof vi.fn>
  }

  const poll = {
    id: POLL_ID,
    electedOfficeId: ELECTED_OFFICE_ID,
    isCompleted: false,
    scheduledDate: new Date('2020-01-01'),
  } as const

  const office = { id: ELECTED_OFFICE_ID, campaignId: CAMPAIGN_ID }

  const campaign = {
    id: CAMPAIGN_ID,
    userId: USER_ID,
    pathToVictory: { data: { electionLocation: 'Test City' } },
  }

  beforeEach(async () => {
    vi.stubEnv('SERVE_DATA_S3_BUCKET', 'test-bucket')

    mockPollsService = {
      findUnique: vi.fn().mockResolvedValue(poll),
      markPollComplete: vi.fn().mockResolvedValue(undefined),
      model: { count: vi.fn().mockResolvedValue(1) },
    }
    mockElectedOfficeService = { findUnique: vi.fn().mockResolvedValue(office) }
    mockCampaignsService = { findUnique: vi.fn().mockResolvedValue(campaign) }
    mockContactsService = {
      findContacts: vi.fn().mockResolvedValue({
        pagination: { totalResults: 100 },
      }),
    }
    mockPollIssuesService = {
      model: { deleteMany: vi.fn().mockResolvedValue(undefined) },
      client: {
        pollIssue: { createMany: vi.fn().mockResolvedValue(undefined) },
      },
    }
    mockPollIndividualMessage = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { personCellPhone: '+15551234567', personId: 'person-1' },
        ]),
      createMany: vi.fn().mockResolvedValue(undefined),
    }
    mockS3Service = {
      getFile: vi.fn().mockResolvedValue(minimalResponsesCsv),
    }
    mockAnalytics = {
      identify: vi.fn().mockResolvedValue(undefined),
      track: vi.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AiContentService, useValue: {} },
        { provide: SlackService, useValue: {} },
        { provide: PathToVictoryService, useValue: {} },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: CampaignsService, useValue: mockCampaignsService },
        { provide: CampaignTcrComplianceService, useValue: {} },
        { provide: DomainsService, useValue: {} },
        { provide: PollsService, useValue: mockPollsService },
        { provide: PollIssuesService, useValue: mockPollIssuesService },
        {
          provide: PollIndividualMessageService,
          useValue: mockPollIndividualMessage,
        },
        { provide: ElectedOfficeService, useValue: mockElectedOfficeService },
        { provide: ContactsService, useValue: mockContactsService },
        { provide: S3Service, useValue: mockS3Service },
        { provide: UsersService, useValue: {} },
        QueueConsumerService,
      ],
    }).compile()

    service = module.get(QueueConsumerService)
    const mockLogger = createMockLogger()
    Object.defineProperty(service, 'logger', {
      get: () => mockLogger,
      configurable: true,
    })
  })

  it('processes POLL_ANALYSIS_COMPLETE message and does not requeue on success', async () => {
    const message = makeSqsMessage(validPollAnalysisCompleteBody)
    const shouldRequeue = await service.handleMessageAndMaybeRequeue(message)

    expect(shouldRequeue).toBe(false)

    expect(mockPollsService.findUnique).toHaveBeenCalledWith({
      where: { id: POLL_ID },
    })
    expect(mockElectedOfficeService.findUnique).toHaveBeenCalledWith({
      where: { id: ELECTED_OFFICE_ID },
    })
    expect(mockCampaignsService.findUnique).toHaveBeenCalledWith({
      where: { id: CAMPAIGN_ID },
      include: { pathToVictory: true },
    })
    expect(mockContactsService.findContacts).toHaveBeenCalledWith(
      { segment: 'all', resultsPerPage: 5, page: 1 },
      campaign,
    )
    expect(mockPollIssuesService.model.deleteMany).toHaveBeenCalledWith({
      where: { pollId: POLL_ID },
    })
    expect(mockPollIssuesService.client.pollIssue.createMany).toHaveBeenCalled()
    expect(mockS3Service.getFile).toHaveBeenCalledWith(
      'test-bucket',
      RESPONSES_LOCATION,
    )
    expect(mockPollIndividualMessage.findMany).toHaveBeenCalledWith({
      where: {
        electedOfficeId: ELECTED_OFFICE_ID,
        pollId: POLL_ID,
        personCellPhone: { in: ['+15551234567'] },
        sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
      },
    })
    expect(mockPollIndividualMessage.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${POLL_ID}-person-1`,
          personId: 'person-1',
          pollId: POLL_ID,
          electedOfficeId: ELECTED_OFFICE_ID,
          isOptOut: false,
          content: 'Hello',
        }),
      ]),
    )
    expect(mockPollsService.markPollComplete).toHaveBeenCalledWith({
      pollId: POLL_ID,
      totalResponses: 2,
      confidence: 'LOW',
    })
    expect(mockAnalytics.identify).toHaveBeenCalledWith(USER_ID, {
      pollcount: 1,
    })
    expect(mockAnalytics.track).toHaveBeenCalledWith(
      USER_ID,
      expect.any(String),
      expect.objectContaining({ pollId: POLL_ID }),
    )
  })

  it('marks high confidence when totalResponses > 75', async () => {
    const body = {
      ...validPollAnalysisCompleteBody,
      data: { ...validPollAnalysisCompleteBody.data, totalResponses: 100 },
    }
    const message = makeSqsMessage(body)
    await service.handleMessageAndMaybeRequeue(message)

    expect(mockPollsService.markPollComplete).toHaveBeenCalledWith({
      pollId: POLL_ID,
      totalResponses: 100,
      confidence: 'HIGH',
    })
  })

  it('ignores event when poll is not found (and requeues because handler returns undefined)', async () => {
    mockPollsService.findUnique.mockResolvedValue(null)
    const message = makeSqsMessage(validPollAnalysisCompleteBody)
    const shouldRequeue = await service.handleMessageAndMaybeRequeue(message)

    expect(shouldRequeue).toBe(true)
    expect(mockPollIssuesService.model.deleteMany).not.toHaveBeenCalled()
    expect(mockPollsService.markPollComplete).not.toHaveBeenCalled()
  })

  it('ignores event when poll is already completed (and requeues because handler returns undefined)', async () => {
    mockPollsService.findUnique.mockResolvedValue({
      ...poll,
      isCompleted: true,
    })
    const message = makeSqsMessage(validPollAnalysisCompleteBody)
    const shouldRequeue = await service.handleMessageAndMaybeRequeue(message)

    expect(shouldRequeue).toBe(true)
    expect(mockPollsService.markPollComplete).not.toHaveBeenCalled()
  })

  it('requeues when S3 returns no file', async () => {
    mockS3Service.getFile.mockResolvedValue(null)
    const message = makeSqsMessage(validPollAnalysisCompleteBody)
    const shouldRequeue = await service.handleMessageAndMaybeRequeue(message)

    expect(shouldRequeue).toBe(true)
  })

  it('requeues when personId not found for a response phone number', async () => {
    mockPollIndividualMessage.findMany.mockResolvedValue([])
    const message = makeSqsMessage(validPollAnalysisCompleteBody)
    const shouldRequeue = await service.handleMessageAndMaybeRequeue(message)

    expect(shouldRequeue).toBe(true)
  })
})
