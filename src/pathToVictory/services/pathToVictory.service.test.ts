import { CampaignCreatedBy } from '@goodparty_org/contracts'
import { CrmCampaignsService } from '@/campaigns/services/crmCampaigns.service'
import { ElectionsService } from '@/elections/services/elections.service'
import { P2VStatus } from '@/elections/types/pathToVictory.types'
import { EmailService } from '@/email/email.service'
import { EmailTemplateName } from '@/email/email.types'
import { CustomEventType } from '@/observability/newrelic/newrelic.events'
import { PrismaService } from '@/prisma/prisma.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { PinoLogger } from 'nestjs-pino'
import { SegmentService } from '@/vendors/segment/segment.service'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { SlackChannel } from '@/vendors/slack/slackService.types'
import { Test, TestingModule } from '@nestjs/testing'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { PathToVictoryInput } from '../types/pathToVictory.types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfficeMatchService } from './officeMatch.service'
import { PathToVictoryService } from './pathToVictory.service'

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

const makeP2VInput = (
  overrides: Partial<PathToVictoryInput> = {},
): PathToVictoryInput => ({
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
  ...overrides,
})

describe('PathToVictoryService', () => {
  let service: PathToVictoryService
  let mockPrisma: {
    campaign: { findUnique: ReturnType<typeof vi.fn> }
    pathToVictory: {
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      findUnique: ReturnType<typeof vi.fn>
      findUniqueOrThrow: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
      count: ReturnType<typeof vi.fn>
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
  let mockOfficeMatch: {
    searchDistrictTypes: ReturnType<typeof vi.fn>
    getSearchColumn: ReturnType<typeof vi.fn>
  }
  let mockElections: {
    buildRaceTargetDetails: ReturnType<typeof vi.fn>
  }
  let mockEmail: {
    sendTemplateEmail: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockPrisma = {
      campaign: { findUnique: vi.fn() },
      pathToVictory: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
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
    mockOfficeMatch = {
      searchDistrictTypes: vi.fn().mockResolvedValue([]),
      getSearchColumn: vi.fn().mockResolvedValue(null),
    }
    mockElections = {
      buildRaceTargetDetails: vi.fn().mockResolvedValue(null),
    }
    mockEmail = {
      sendTemplateEmail: vi.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PathToVictoryService,
        { provide: PinoLogger, useValue: createMockLogger() },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OfficeMatchService, useValue: mockOfficeMatch },
        { provide: SlackService, useValue: mockSlack },
        { provide: EmailService, useValue: mockEmail },
        { provide: SegmentService, useValue: {} },
        { provide: CrmCampaignsService, useValue: mockCrm },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: ElectionsService, useValue: mockElections },
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

    it('returns false and skips completePathToVictory when district found but no turnout', async () => {
      const input = makeAnalyzeInput({
        pathToVictoryResponse: {
          counts: { projectedTurnout: 0, winNumber: 0, voterContactGoal: 0 },
          electionType: 'State_House',
          electionLocation: 'STATE HOUSE 005',
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await service.analyzePathToVictoryResponse(input as any)

      // Returns false so queue consumer retries silver (LLM is non-deterministic)
      expect(result).toBe(false)
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
      // completePathToVictory is NOT called — gold's data is preserved.
      // handlePathToVictoryFailure in the queue consumer will track p2vAttempts.
      expect(service.completePathToVictory).not.toHaveBeenCalled()
    })

    it('returns false and skips completePathToVictory when no district and no turnout', async () => {
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
      // completePathToVictory is NOT called — gold's data (source, sentinels)
      // is preserved. handlePathToVictoryFailure handles retries and final status.
      expect(service.completePathToVictory).not.toHaveBeenCalled()
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

    it('upgrades status from Waiting to Complete and writes source GpApi', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(
        makeCampaign({ p2vStatus: P2VStatus.waiting }),
      )
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', responseWithTurnout)

      const updateCall = mockPrisma.pathToVictory.update.mock.calls[0][0]
      const writtenData = updateCall.data.data

      expect(writtenData.p2vStatus).toBe('Complete')
      expect(writtenData.source).toBe('GpApi')
      expect(writtenData.projectedTurnout).toBe(500)
      expect(writtenData.winNumber).toBe(251)
      expect(writtenData.voterContactGoal).toBe(1255)
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

    it('keeps electionType/electionLocation when office changed and writes sentinel turnout values', async () => {
      // Scenario: candidate had complete P2V, switches office, gold flow
      // matches a district but finds no turnout (sentinel -1 values)
      const sentinelResponse = {
        counts: {
          projectedTurnout: -1,
          winNumber: -1,
          voterContactGoal: -1,
        },
        electionType: 'State_Senate',
        electionLocation: 'STATE SENATE 010',
      }

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

      await service.completePathToVictory('test-slug', sentinelResponse, {
        officeFingerprint: 'new-fingerprint',
        p2vStatusOverride: P2VStatus.districtMatched,
      })

      const updateCall = mockPrisma.pathToVictory.update.mock.calls[0][0]
      const writtenData = updateCall.data.data

      // New district data should overwrite old
      expect(writtenData.electionType).toBe('State_Senate')
      expect(writtenData.electionLocation).toBe('STATE SENATE 010')
      // Stale turnout should be replaced with sentinel -1 values,
      // not left absent — so the record explicitly reflects "no turnout found"
      expect(writtenData.projectedTurnout).toBe(-1)
      expect(writtenData.winNumber).toBe(-1)
      expect(writtenData.voterContactGoal).toBe(-1)
      // p2vAttempts should be reset to 0 because office changed
      expect(writtenData.p2vAttempts).toBe(0)
      // New fingerprint should be set
      expect(writtenData.officeContextFingerprint).toBe('new-fingerprint')
    })

    it('overwrites turnout with sentinel -1 when same office but turnout no longer available', async () => {
      // Scenario: same office, previously had turnout, now gold flow returns
      // district match but no turnout (sentinel -1). Should overwrite stale turnout.
      const sentinelResponse = {
        counts: {
          projectedTurnout: -1,
          winNumber: -1,
          voterContactGoal: -1,
        },
        electionType: 'State_House',
        electionLocation: 'STATE HOUSE 005',
      }

      mockPrisma.campaign.findUnique.mockResolvedValue(
        makeCampaign({
          p2vStatus: P2VStatus.complete,
          projectedTurnout: 500,
          winNumber: 251,
          voterContactGoal: 1255,
          electionType: 'State_House',
          electionLocation: 'STATE HOUSE 005',
          officeContextFingerprint: 'same-fingerprint',
        }),
      )
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', sentinelResponse, {
        officeFingerprint: 'same-fingerprint',
        p2vStatusOverride: P2VStatus.districtMatched,
      })

      const updateCall = mockPrisma.pathToVictory.update.mock.calls[0][0]
      const writtenData = updateCall.data.data

      expect(writtenData.projectedTurnout).toBe(-1)
      expect(writtenData.winNumber).toBe(-1)
      expect(writtenData.voterContactGoal).toBe(-1)
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

    it('returns early and sends Slack when no campaign found for slug', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(null)

      await service.completePathToVictory('missing-slug', emptyResponse)

      expect(mockSlack.errorMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('missing-slug'),
        }),
      )
      expect(mockPrisma.pathToVictory.update).not.toHaveBeenCalled()
    })

    it('creates a new PathToVictory record when campaign has none', async () => {
      const campaignWithoutP2V = {
        ...makeCampaign(),
        pathToVictory: null,
      }
      mockPrisma.campaign.findUnique.mockResolvedValue(campaignWithoutP2V)
      mockPrisma.pathToVictory.create.mockResolvedValue({
        id: 200,
        campaignId: 1,
        data: {},
      })
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', responseWithTurnout)

      expect(mockPrisma.pathToVictory.create).toHaveBeenCalledWith({
        data: {
          campaign: { connect: { id: 1 } },
        },
      })
      expect(mockPrisma.pathToVictory.update).toHaveBeenCalled()
    })

    it('sends victory-ready email when status transitions to Complete for non-admin campaigns', async () => {
      const originalEnv = process.env.WEBAPP_ROOT
      process.env.WEBAPP_ROOT = 'https://goodparty.org'

      mockPrisma.campaign.findUnique.mockResolvedValue(
        makeCampaign({ p2vStatus: P2VStatus.waiting }),
      )
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', responseWithTurnout, {
        sendEmail: true,
      })

      expect(mockEmail.sendTemplateEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          template: EmailTemplateName.candidateVictoryReady,
        }),
      )

      process.env.WEBAPP_ROOT = originalEnv
    })

    it('does not send email when sendEmail option is false', async () => {
      const originalEnv = process.env.WEBAPP_ROOT
      process.env.WEBAPP_ROOT = 'https://goodparty.org'

      mockPrisma.campaign.findUnique.mockResolvedValue(
        makeCampaign({ p2vStatus: P2VStatus.waiting }),
      )
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', responseWithTurnout, {
        sendEmail: false,
      })

      expect(mockEmail.sendTemplateEmail).not.toHaveBeenCalled()

      process.env.WEBAPP_ROOT = originalEnv
    })

    it('does not send email for admin-created campaigns', async () => {
      const originalEnv = process.env.WEBAPP_ROOT
      process.env.WEBAPP_ROOT = 'https://goodparty.org'

      const adminCampaign = {
        ...makeCampaign({ p2vStatus: P2VStatus.waiting }),
        data: { name: 'Admin Campaign', createdBy: CampaignCreatedBy.ADMIN },
      }
      mockPrisma.campaign.findUnique.mockResolvedValue(adminCampaign)
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', responseWithTurnout, {
        sendEmail: true,
      })

      expect(mockEmail.sendTemplateEmail).not.toHaveBeenCalled()

      process.env.WEBAPP_ROOT = originalEnv
    })

    it('calls analytics.identify with winNumber', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(
        makeCampaign({ p2vStatus: P2VStatus.waiting }),
      )
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', responseWithTurnout)

      expect(mockAnalytics.identify).toHaveBeenCalledWith(10, {
        winNumber: 251,
      })
    })

    it('updates CRM with final p2vStatus', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(
        makeCampaign({ p2vStatus: P2VStatus.waiting }),
      )
      mockPrisma.pathToVictory.update.mockResolvedValue({})

      await service.completePathToVictory('test-slug', responseWithTurnout)

      expect(mockCrm.handleUpdateCampaign).toHaveBeenCalledWith(
        expect.anything(),
        'path_to_victory_status',
        P2VStatus.complete,
      )
    })

    it('catches errors and sends Slack error message', async () => {
      mockPrisma.campaign.findUnique.mockRejectedValue(
        new Error('DB connection lost'),
      )

      await service.completePathToVictory('test-slug', responseWithTurnout)

      expect(mockSlack.errorMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'error updating campaign with path to victory',
        }),
      )
    })
  })

  describe('listPathToVictories', () => {
    it('returns paginated results with default parameters', async () => {
      const mockRecords = [
        { id: 1, campaignId: 100, data: {} },
        { id: 2, campaignId: 101, data: {} },
      ]
      mockPrisma.pathToVictory.findMany.mockResolvedValue(mockRecords)
      mockPrisma.pathToVictory.count.mockResolvedValue(2)

      const result = await service.listPathToVictories({})

      expect(result.data).toEqual(mockRecords)
      expect(result.meta).toEqual({ total: 2, offset: 0, limit: 100 })
    })

    it('applies custom pagination', async () => {
      mockPrisma.pathToVictory.findMany.mockResolvedValue([])
      mockPrisma.pathToVictory.count.mockResolvedValue(50)

      const result = await service.listPathToVictories({
        offset: 10,
        limit: 5,
      })

      expect(mockPrisma.pathToVictory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 5,
        }),
      )
      expect(result.meta).toEqual({ total: 50, offset: 10, limit: 5 })
    })

    it('applies custom sorting', async () => {
      mockPrisma.pathToVictory.findMany.mockResolvedValue([])
      mockPrisma.pathToVictory.count.mockResolvedValue(0)

      await service.listPathToVictories({
        sortBy: 'updatedAt',
        sortOrder: 'asc',
      })

      expect(mockPrisma.pathToVictory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { updatedAt: 'asc' },
        }),
      )
    })

    it('filters by userId when provided', async () => {
      mockPrisma.pathToVictory.findMany.mockResolvedValue([])
      mockPrisma.pathToVictory.count.mockResolvedValue(0)

      await service.listPathToVictories({ userId: 42 })

      expect(mockPrisma.pathToVictory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { campaign: { userId: 42 } },
        }),
      )
      expect(mockPrisma.pathToVictory.count).toHaveBeenCalledWith({
        where: { campaign: { userId: 42 } },
      })
    })

    it('does not filter by userId when not provided', async () => {
      mockPrisma.pathToVictory.findMany.mockResolvedValue([])
      mockPrisma.pathToVictory.count.mockResolvedValue(0)

      await service.listPathToVictories({})

      expect(mockPrisma.pathToVictory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      )
    })
  })

  describe('handlePathToVictory', () => {
    it('skips searchDistrictTypes for "At Large" offices', async () => {
      mockOfficeMatch.getSearchColumn.mockResolvedValue({
        column: 'State_House',
        value: 'At Large District',
      })
      mockElections.buildRaceTargetDetails.mockResolvedValue({
        projectedTurnout: 1000,
        winNumber: 501,
        voterContactGoal: 2505,
      })

      const input = makeP2VInput({ officeName: 'City Council At Large' })
      const result = await service.handlePathToVictory(input)

      expect(mockOfficeMatch.searchDistrictTypes).not.toHaveBeenCalled()
      expect(result.pathToVictoryResponse.counts.projectedTurnout).toBe(1000)
    })

    it('skips searchDistrictTypes for "President of the United States"', async () => {
      mockOfficeMatch.getSearchColumn.mockResolvedValue({
        column: 'US_President',
        value: 'US',
      })
      mockElections.buildRaceTargetDetails.mockResolvedValue({
        projectedTurnout: 150000000,
        winNumber: 75000001,
        voterContactGoal: 100000000,
      })

      const input = makeP2VInput({
        officeName: 'President of the United States',
        electionLevel: 'federal',
      })
      const result = await service.handlePathToVictory(input)

      expect(mockOfficeMatch.searchDistrictTypes).not.toHaveBeenCalled()
      expect(result.pathToVictoryResponse.counts.projectedTurnout).toBe(
        150000000,
      )
    })

    it('calls searchDistrictTypes for non-special offices', async () => {
      mockOfficeMatch.searchDistrictTypes.mockResolvedValue(['State_House'])
      mockOfficeMatch.getSearchColumn.mockResolvedValue({
        column: 'State_House',
        value: 'STATE HOUSE 005',
      })
      mockElections.buildRaceTargetDetails.mockResolvedValue({
        projectedTurnout: 500,
        winNumber: 251,
        voterContactGoal: 1255,
      })

      const input = makeP2VInput({ officeName: 'State Representative' })
      const result = await service.handlePathToVictory(input)

      expect(mockOfficeMatch.searchDistrictTypes).toHaveBeenCalledWith(
        'test-slug',
        'State Representative',
        'local',
        'CA',
        undefined,
        undefined,
      )
      expect(result.pathToVictoryResponse.electionType).toBe('State_House')
      expect(result.pathToVictoryResponse.electionLocation).toBe(
        'STATE HOUSE 005',
      )
      expect(result.pathToVictoryResponse.counts.projectedTurnout).toBe(500)
    })

    it('returns empty response when no search columns found', async () => {
      mockOfficeMatch.searchDistrictTypes.mockResolvedValue([])

      const input = makeP2VInput()
      const result = await service.handlePathToVictory(input)

      expect(result.pathToVictoryResponse.counts.projectedTurnout).toBe(0)
      expect(result.pathToVictoryResponse.electionType).toBe('')
      expect(result.pathToVictoryResponse.electionLocation).toBe('')
    })

    it('tries multiple search columns until one succeeds', async () => {
      mockOfficeMatch.searchDistrictTypes.mockResolvedValue([
        'County_Council',
        'City_Council',
      ])
      mockOfficeMatch.getSearchColumn
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          column: 'City_Council',
          value: 'WARD 3',
        })
      mockElections.buildRaceTargetDetails.mockResolvedValue({
        projectedTurnout: 800,
        winNumber: 401,
        voterContactGoal: 2005,
      })

      const input = makeP2VInput()
      const result = await service.handlePathToVictory(input)

      expect(mockOfficeMatch.getSearchColumn).toHaveBeenCalledTimes(2)
      expect(result.pathToVictoryResponse.electionType).toBe('City_Council')
      expect(result.pathToVictoryResponse.counts.projectedTurnout).toBe(800)
    })

    it('returns partial match when district found but no turnout', async () => {
      mockOfficeMatch.searchDistrictTypes.mockResolvedValue(['State_House'])
      mockOfficeMatch.getSearchColumn.mockResolvedValue({
        column: 'State_House',
        value: 'STATE HOUSE 005',
      })
      mockElections.buildRaceTargetDetails.mockResolvedValue({
        projectedTurnout: 0,
        winNumber: 0,
        voterContactGoal: 0,
      })

      const input = makeP2VInput()
      const result = await service.handlePathToVictory(input)

      // Sentinel -1 values signal "district matched, no turnout"
      expect(result.pathToVictoryResponse.electionType).toBe('State_House')
      expect(result.pathToVictoryResponse.electionLocation).toBe(
        'STATE HOUSE 005',
      )
      expect(result.pathToVictoryResponse.counts.projectedTurnout).toBe(-1)
      expect(result.pathToVictoryResponse.counts.winNumber).toBe(-1)
      expect(result.pathToVictoryResponse.counts.voterContactGoal).toBe(-1)
    })

    it('skips columns with zero projected turnout and continues searching', async () => {
      mockOfficeMatch.searchDistrictTypes.mockResolvedValue([
        'District_A',
        'District_B',
      ])
      mockOfficeMatch.getSearchColumn
        .mockResolvedValueOnce({ column: 'District_A', value: 'A-1' })
        .mockResolvedValueOnce({ column: 'District_B', value: 'B-2' })
      mockElections.buildRaceTargetDetails
        .mockResolvedValueOnce({ projectedTurnout: 0 })
        .mockResolvedValueOnce({
          projectedTurnout: 300,
          winNumber: 151,
          voterContactGoal: 755,
        })

      const input = makeP2VInput()
      const result = await service.handlePathToVictory(input)

      expect(result.pathToVictoryResponse.electionType).toBe('District_B')
      expect(result.pathToVictoryResponse.counts.projectedTurnout).toBe(300)
    })

    it('uses "US" as state for President of the United States', async () => {
      mockOfficeMatch.getSearchColumn.mockResolvedValue({
        column: 'US_President',
        value: 'US',
      })
      mockElections.buildRaceTargetDetails.mockResolvedValue({
        projectedTurnout: 100,
        winNumber: 51,
        voterContactGoal: 255,
      })

      const input = makeP2VInput({
        officeName: 'President of the United States',
        electionLevel: 'federal',
        electionState: 'CA',
      })
      await service.handlePathToVictory(input)

      expect(mockElections.buildRaceTargetDetails).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'US' }),
      )
    })

    it('throws and sends Slack error on unexpected exception', async () => {
      mockOfficeMatch.searchDistrictTypes.mockRejectedValue(
        new Error('AI service down'),
      )

      const input = makeP2VInput()

      await expect(service.handlePathToVictory(input)).rejects.toThrow(
        'Error in handle-p2v',
      )
      expect(mockSlack.errorMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Error in handle-p2v',
        }),
      )
    })

    it('returns slug in the response', async () => {
      mockOfficeMatch.searchDistrictTypes.mockResolvedValue([])

      const input = makeP2VInput({ slug: 'my-campaign' })
      const result = await service.handlePathToVictory(input)

      expect(result.slug).toBe('my-campaign')
    })
  })

  describe('analyzePathToVictoryResponse', () => {
    beforeEach(() => {
      vi.spyOn(service, 'completePathToVictory').mockResolvedValue(undefined)
    })

    it('sets sendEmail flag to true when first reaching Complete status', async () => {
      const input = makeAnalyzeInput({
        campaign: makeCampaign({ p2vStatus: P2VStatus.waiting }),
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
      await service.analyzePathToVictoryResponse(input as any)

      expect(service.completePathToVictory).toHaveBeenCalledWith(
        'test-slug',
        expect.anything(),
        expect.objectContaining({ sendEmail: true }),
      )
    })

    it('sets sendEmail flag to false when already Complete', async () => {
      const input = makeAnalyzeInput({
        campaign: makeCampaign({ p2vStatus: P2VStatus.complete }),
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
      await service.analyzePathToVictoryResponse(input as any)

      expect(service.completePathToVictory).toHaveBeenCalledWith(
        'test-slug',
        expect.anything(),
        expect.objectContaining({ sendEmail: false }),
      )
    })

    it('passes officeFingerprint to completePathToVictory', async () => {
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
      await service.analyzePathToVictoryResponse(input as any)

      expect(service.completePathToVictory).toHaveBeenCalledWith(
        'test-slug',
        expect.anything(),
        expect.objectContaining({
          officeFingerprint: expect.any(String),
        }),
      )
    })
  })
})
