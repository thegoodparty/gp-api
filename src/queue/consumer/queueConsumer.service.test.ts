import { Test, TestingModule } from '@nestjs/testing'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { P2VStatus } from '@/elections/types/pathToVictory.types'
import { QueueConsumerService } from './queueConsumer.service'
import { AiContentService } from '@/campaigns/ai/content/aiContent.service'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { PathToVictoryService } from '@/pathToVictory/services/pathToVictory.service'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { CampaignsService } from '@/campaigns/services/campaigns.service'
import { CampaignTcrComplianceService } from '@/campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { DomainsService } from '@/websites/services/domains.service'
import { PollsService } from '@/polls/services/polls.service'
import { PollIssuesService } from '@/polls/services/pollIssues.service'
import { ElectedOfficeService } from '@/electedOffice/services/electedOffice.service'
import { ContactsService } from '@/contacts/services/contacts.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { UsersService } from '@/users/services/users.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    // Access private method
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let handleFailure: (campaign: ReturnType<typeof makeCampaign>) => Promise<boolean>

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handleFailure = (service as any).handlePathToVictoryFailure.bind(service)
    })

    it('returns false and keeps status when already DistrictMatched after 3+ attempts', async () => {
      mockP2vService.findUniqueOrThrow.mockResolvedValue(
        makeP2V({
          p2vAttempts: 2,
          p2vStatus: P2VStatus.districtMatched,
          electionType: 'State_House',
          electionLocation: 'STATE HOUSE 005',
        }),
      )

      const result = await handleFailure(makeCampaign())

      expect(result).toBe(false)
      // Should persist p2vAttempts to prevent infinite retry
      expect(mockP2vService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            data: expect.objectContaining({ p2vAttempts: 3 }),
          }),
        }),
      )
      // Should NOT overwrite status to Failed
      const updateData = mockP2vService.update.mock.calls[0][0].data.data
      expect(updateData.p2vStatus).toBe(P2VStatus.districtMatched)
      // Should NOT send failure Slack or record BlockedState
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
      // handlePathToVictoryFailure will return false (don't requeue)
      mockP2vService.findUniqueOrThrow.mockResolvedValue(
        makeP2V({
          p2vAttempts: 2,
          p2vStatus: P2VStatus.districtMatched,
        }),
      )

      // processMessage is wrapped in withLegacyErrorSwallowing.
      // When handlePathToVictoryMessage does NOT throw, it returns true.
      const result = await service.processMessage(
        makeQueueMessage() as never,
      )

      expect(result).toBe(true)
    })

  })
})
