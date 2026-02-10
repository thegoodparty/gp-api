import { Test, TestingModule } from '@nestjs/testing'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { PrismaService } from '@/prisma/prisma.service'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { SlackChannel } from '@/vendors/slack/slackService.types'
import { EmailService } from '@/email/email.service'
import { CrmCampaignsService } from '@/campaigns/services/crmCampaigns.service'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { ElectionsService } from '@/elections/services/elections.service'
import { P2VStatus } from '@/elections/types/pathToVictory.types'
import { CustomEventType } from '@/observability/newrelic/newrelic.events'
import { SegmentService } from '@/vendors/segment/segment.service'
import { PathToVictoryService } from './pathToVictory.service'
import { OfficeMatchService } from './officeMatch.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRecordCustomEvent = vi.fn()
vi.mock('src/observability/newrelic/newrelic.client', () => ({
  recordCustomEvent: (...args: unknown[]) => mockRecordCustomEvent(...args),
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeCampaign = (p2vData: Record<string, unknown> = {}) => ({
  id: 1,
  userId: 10,
  slug: 'test-slug',
  data: { name: 'Test Candidate', createdBy: 'user' },
  user: { email: 'test@example.com', name: 'Test User' },
  pathToVictory: {
    id: 100,
    campaignId: 1,
    data: {
      p2vStatus: P2VStatus.waiting,
      ...p2vData,
    },
  },
})

const makeAnalyzeInput = (overrides: Record<string, unknown> = {}) => {
  const base = {
    campaign: makeCampaign(),
    pathToVictoryResponse: {
      counts: { projectedTurnout: 0, winNumber: 0, voterContactGoal: 0 },
      electionType: '',
      electionLocation: '',
    },
    officeName: 'City Council',
    electionDate: '2024-11-05',
    electionTerm: 4,
    electionLevel: 'local',
    electionState: 'CA',
    electionCounty: 'Los Angeles',
    electionMunicipality: 'Los Angeles',
    partisanType: 'nonpartisan',
    priorElectionDates: [] as string[],
  }
  return { ...base, ...overrides }
}

describe('PathToVictoryService', () => {
  let service: PathToVictoryService
  let mockPrisma: {
    campaign: { findUnique: ReturnType<typeof vi.fn> }
    pathToVictory: {
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      findUnique: ReturnType<typeof vi.fn>
      findUniqueOrThrow: ReturnType<typeof vi.fn>
    }
  }
  let mockSlack: {
    formattedMessage: ReturnType<typeof vi.fn>
    errorMessage: ReturnType<typeof vi.fn>
    message: ReturnType<typeof vi.fn>
  }
  let mockCrm: { handleUpdateCampaign: ReturnType<typeof vi.fn> }
  let mockAnalytics: {
    identify: ReturnType<typeof vi.fn>
    track: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockPrisma = {
      campaign: { findUnique: vi.fn() },
      pathToVictory: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
    }
    mockSlack = {
      formattedMessage: vi.fn().mockResolvedValue(undefined),
      errorMessage: vi.fn().mockResolvedValue(undefined),
      message: vi.fn().mockResolvedValue(undefined),
    }
    mockCrm = { handleUpdateCampaign: vi.fn().mockResolvedValue(undefined) }
    mockAnalytics = {
      identify: vi.fn().mockResolvedValue(undefined),
      track: vi.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PathToVictoryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OfficeMatchService, useValue: {} },
        { provide: SlackService, useValue: mockSlack },
        { provide: EmailService, useValue: { sendTemplateEmail: vi.fn() } },
        { provide: SegmentService, useValue: {} },
        { provide: CrmCampaignsService, useValue: mockCrm },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: ElectionsService, useValue: {} },
      ],
    }).compile()

    service = module.get<PathToVictoryService>(PathToVictoryService)

    const mockLogger = createMockLogger()
    Object.defineProperty(service, 'logger', {
      get: () => mockLogger,
      configurable: true,
    })

    vi.clearAllMocks()
  })

  describe('analyzePathToVictoryResponse', () => {
    beforeEach(() => {
      vi.spyOn(service, 'completePathToVictory').mockResolvedValue(undefined)
    })

    it('returns true and sends Slack to success channel when turnout is present', async () => {
      const input = makeAnalyzeInput({
        pathToVictoryResponse: {
          counts: {
            projectedTurnout: 500,
            winNumber: 251,
            voterContactGoal: 1255,
          },
          electionType: 'State_House',
          electionLocation: 'STATE HOUSE 005',
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await service.analyzePathToVictoryResponse(input as any)

      expect(result).toBe(true)
      expect(mockSlack.formattedMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: SlackChannel.botPathToVictory,
        }),
      )
      expect(service.completePathToVictory).toHaveBeenCalledWith(
        'test-slug',
        expect.anything(),
        expect.objectContaining({
          p2vStatusOverride: undefined,
        }),
      )
    })

    it('returns true and sets DistrictMatched when district found but no turnout', async () => {
      const input = makeAnalyzeInput({
        pathToVictoryResponse: {
          counts: { projectedTurnout: 0, winNumber: 0, voterContactGoal: 0 },
          electionType: 'State_House',
          electionLocation: 'STATE HOUSE 005',
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await service.analyzePathToVictoryResponse(input as any)

      expect(result).toBe(true)
      expect(mockSlack.formattedMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: SlackChannel.botPathToVictoryIssues,
        }),
      )
      expect(mockCrm.handleUpdateCampaign).toHaveBeenCalledWith(
        expect.anything(),
        'path_to_victory_status',
        P2VStatus.districtMatched,
      )
      expect(service.completePathToVictory).toHaveBeenCalledWith(
        'test-slug',
        expect.anything(),
        expect.objectContaining({
          p2vStatusOverride: P2VStatus.districtMatched,
        }),
      )
    })

    it('returns false and sets Failed when no district and no turnout', async () => {
      const input = makeAnalyzeInput()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await service.analyzePathToVictoryResponse(input as any)

      expect(result).toBe(false)
      expect(mockSlack.formattedMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: SlackChannel.botPathToVictoryIssues,
        }),
      )
      expect(mockRecordCustomEvent).toHaveBeenCalledWith(
        CustomEventType.BlockedState,
        expect.objectContaining({
          rootCause: 'p2v_failed',
          reason: 'no_district_match',
        }),
      )
      expect(mockCrm.handleUpdateCampaign).toHaveBeenCalledWith(
        expect.anything(),
        'path_to_victory_status',
        P2VStatus.failed,
      )
      expect(service.completePathToVictory).toHaveBeenCalledWith(
        'test-slug',
        expect.anything(),
        expect.objectContaining({
          p2vStatusOverride: P2VStatus.failed,
        }),
      )
    })
  })

  describe('completePathToVictory', () => {
    const emptyResponse = {
      counts: { projectedTurnout: 0, winNumber: 0, voterContactGoal: 0 },
      electionType: '',
      electionLocation: '',
    }

    const responseWithTurnout = {
      counts: {
        projectedTurnout: 500,
        winNumber: 251,
        voterContactGoal: 1255,
      },
      electionType: 'State_House',
      electionLocation: 'STATE HOUSE 005',
    }

    it('does not downgrade status from DistrictMatched to Failed', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(
        makeCampaign({ p2vStatus: P2VStatus.districtMatched }),
      )
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', emptyResponse, {
        p2vStatusOverride: P2VStatus.failed,
      })

      expect(mockPrisma.pathToVictory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            data: expect.objectContaining({
              p2vStatus: P2VStatus.districtMatched,
            }),
          }),
        }),
      )
    })

    it('upgrades status from Waiting to Complete when incoming has turnout', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(
        makeCampaign({ p2vStatus: P2VStatus.waiting }),
      )
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', responseWithTurnout)

      expect(mockPrisma.pathToVictory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            data: expect.objectContaining({
              p2vStatus: P2VStatus.complete,
            }),
          }),
        }),
      )
    })

    it('infers DistrictMatched when existing record has district data but status is Waiting', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(
        makeCampaign({
          p2vStatus: P2VStatus.waiting,
          electionType: 'State_House',
          electionLocation: 'STATE HOUSE 005',
        }),
      )
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', emptyResponse, {
        p2vStatusOverride: P2VStatus.waiting,
      })

      expect(mockPrisma.pathToVictory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            data: expect.objectContaining({
              p2vStatus: P2VStatus.districtMatched,
            }),
          }),
        }),
      )
    })

    it('keeps electionType/electionLocation when office changed but strips turnout fields', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(
        makeCampaign({
          p2vStatus: P2VStatus.complete,
          projectedTurnout: 500,
          winNumber: 251,
          voterContactGoal: 1255,
          p2vAttempts: 2,
          electionType: 'State_House',
          electionLocation: 'STATE HOUSE 005',
          officeContextFingerprint: 'old-fingerprint',
        }),
      )
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', emptyResponse, {
        officeFingerprint: 'new-fingerprint',
        p2vStatusOverride: P2VStatus.failed,
      })

      const updateCall = mockPrisma.pathToVictory.update.mock.calls[0][0]
      const writtenData = updateCall.data.data

      // District data should be preserved (from baseData)
      expect(writtenData.electionType).toBe('State_House')
      expect(writtenData.electionLocation).toBe('STATE HOUSE 005')
      // Turnout fields should be stripped (not in baseData, not in incoming)
      // p2vAttempts should be reset to 0 because office changed
      expect(writtenData.p2vAttempts).toBe(0)
      // New fingerprint should be set
      expect(writtenData.officeContextFingerprint).toBe('new-fingerprint')
    })

    it('does not overwrite district when incoming has empty values', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(
        makeCampaign({
          electionType: 'State_House',
          electionLocation: 'STATE HOUSE 005',
        }),
      )
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', emptyResponse)

      const updateCall = mockPrisma.pathToVictory.update.mock.calls[0][0]
      const writtenData = updateCall.data.data

      // Existing district data should remain from baseData spread
      expect(writtenData.electionType).toBe('State_House')
      expect(writtenData.electionLocation).toBe('STATE HOUSE 005')
    })

    it('does not overwrite turnout when incoming has zero values', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(
        makeCampaign({
          projectedTurnout: 500,
          winNumber: 251,
          voterContactGoal: 1255,
        }),
      )
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', emptyResponse)

      const updateCall = mockPrisma.pathToVictory.update.mock.calls[0][0]
      const writtenData = updateCall.data.data

      // Existing turnout data should remain from baseData spread
      expect(writtenData.projectedTurnout).toBe(500)
      expect(writtenData.winNumber).toBe(251)
      expect(writtenData.voterContactGoal).toBe(1255)
    })

  })
})
