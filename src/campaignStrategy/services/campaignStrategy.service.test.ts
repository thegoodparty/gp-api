import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Test, type TestingModule } from '@nestjs/testing'
import { Campaign, User } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'src/prisma/prisma.service'
import { BadRequestException } from '@nestjs/common'
import { CampaignStrategyService } from './campaignStrategy.service'
import { ElectionApiService } from './electionApi.service'
import { StrategicLandscapeService } from './strategicLandscape.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { RaceContextFromApi } from '../types/electionApi.types'

const buildPlanRow = (overrides: Record<string, unknown> = {}) => ({
  id: 42,
  campaignId: 99,
  createdAt: new Date(),
  updatedAt: new Date(),
  opportunities: [],
  challenges: [],
  opponents: [],
  ...overrides,
})

const apiCtx: RaceContextFromApi = {
  state: 'CA',
  candidateOffice: 'City Council',
  officialOfficeName: 'Anytown Council',
  officeLevel: 'Local',
  officeType: 'Council',
  primaryElectionDate: '2026-06-01',
  generalElectionDate: '2026-11-01',
  relevantElectionDate: '2026-06-01',
  numberOfSeats: 1,
  projectedTurnout: 1000,
  civicsWinNumber: null,
  winNumberEstimate: 501,
  winNumberEffective: 501,
  contactsNeededEstimate: 2505,
  candidateCount: 2,
  candidates: [
    {
      gpCandidateId: 'a',
      firstName: 'Jane',
      lastName: 'Doe',
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      websiteUrl: null,
      party: 'Independent',
      isIncumbent: null,
    },
    {
      gpCandidateId: 'b',
      firstName: 'Bob',
      lastName: 'Smith',
      fullName: 'Bob Smith',
      email: 'bob@example.com',
      websiteUrl: null,
      party: 'Nonpartisan',
      isIncumbent: true,
    },
  ],
}

const buildCampaign = (
  overrides: Partial<Campaign & { user: User }> = {},
): Campaign & { user: User } =>
  ({
    id: 99,
    organizationSlug: 'campaign-99',
    slug: 'jane',
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    userId: 1,
    details: { party: 'Independent', raceId: 'hash-abc' },
    data: {},
    aiContent: {},
    vendorTsData: {},
    user: {
      id: 1,
      firstName: 'Jane',
      lastName: 'Doe',
      name: 'Jane Doe',
      email: 'jane@example.com',
    } as User,
    ...overrides,
  }) as Campaign & { user: User }

const cachedPlan = (overrides: Record<string, unknown> = {}) =>
  buildPlanRow({
    opportunities: [
      { order: 1, content: 'o1' },
      { order: 2, content: 'o2' },
      { order: 3, content: 'o3' },
    ],
    challenges: [
      { order: 1, content: 'c1' },
      { order: 2, content: 'c2' },
      { order: 3, content: 'c3' },
    ],
    opponents: [],
    ...overrides,
  })

describe('CampaignStrategyService', () => {
  let service: CampaignStrategyService
  let mockPrisma: {
    campaignStrategy: Record<
      | 'upsert'
      | 'findUnique'
      | 'findMany'
      | 'findFirst'
      | 'findFirstOrThrow'
      | 'findUniqueOrThrow'
      | 'count',
      ReturnType<typeof vi.fn>
    >
  }
  let mockStrategic: { generate: ReturnType<typeof vi.fn> }
  let mockElectionApi: { getRaceContext: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockPrisma = {
      campaignStrategy: {
        upsert: vi.fn().mockResolvedValue({ id: 42, campaignId: 99 }),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findFirstOrThrow: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        count: vi.fn(),
      },
    }
    mockStrategic = { generate: vi.fn() }
    mockElectionApi = { getRaceContext: vi.fn().mockResolvedValue(apiCtx) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StrategicLandscapeService, useValue: mockStrategic },
        { provide: ElectionApiService, useValue: mockElectionApi },
        { provide: PinoLogger, useValue: createMockLogger() },
        CampaignStrategyService,
      ],
    }).compile()
    await module.init()

    service = module.get<CampaignStrategyService>(CampaignStrategyService)
  })

  describe('getOrGenerateStrategicLandscape — cache hits', () => {
    it('returns { status: ready, data } when opportunities already exist', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(
        cachedPlan({
          opponents: [
            {
              fullName: 'Bob',
              partyAffiliation: 'Nonpartisan',
              incumbent: true,
              politicalSummary: 'background',
              keyFacts: [{ order: 1, content: 'fact1' }],
              websites: [{ url: 'https://bob.example' }],
            },
          ],
        }),
      )

      const result =
        await service.getOrGenerateStrategicLandscape(buildCampaign())

      expect(result).toEqual({
        status: 'ready',
        data: {
          opportunities: ['o1', 'o2', 'o3'],
          challenges: ['c1', 'c2', 'c3'],
          opponents: [
            {
              fullName: 'Bob',
              partyAffiliation: 'Nonpartisan',
              incumbent: true,
              politicalSummary: 'background',
              keyFacts: ['fact1'],
              websites: ['https://bob.example'],
            },
          ],
        },
      })
      expect(mockStrategic.generate).not.toHaveBeenCalled()
    })

    it('treats the plan as cached when opportunities are empty but challenges or opponents exist', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(
        buildPlanRow({
          opportunities: [],
          challenges: [
            { order: 1, content: 'c1' },
            { order: 2, content: 'c2' },
            { order: 3, content: 'c3' },
          ],
          opponents: [],
        }),
      )

      const result =
        await service.getOrGenerateStrategicLandscape(buildCampaign())

      expect(result.status).toBe('ready')
      if (result.status !== 'ready') return
      expect(result.data.challenges).toEqual(['c1', 'c2', 'c3'])
      expect(result.data.opportunities).toEqual([])
      expect(mockStrategic.generate).not.toHaveBeenCalled()
    })
  })

  describe('getOrGenerateStrategicLandscape — cache misses kick off background generation', () => {
    it('returns { status: generating } immediately and runs generate in the background', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['x', 'y', 'z'],
        opponents: [],
      })

      const result =
        await service.getOrGenerateStrategicLandscape(buildCampaign())

      expect(result).toEqual({ status: 'generating' })

      await service.drainInFlight()

      const { candidates: _candidates, ...apiCtxScalars } = apiCtx
      expect(mockStrategic.generate).toHaveBeenCalledWith(
        42,
        99,
        expect.objectContaining({
          ...apiCtxScalars,
          userFullName: 'Jane Doe',
          userPartyAffiliation: 'Independent',
        }),
      )
      expect(mockElectionApi.getRaceContext).toHaveBeenCalledWith('hash-abc')
    })

    it('subsequent polls during the same in-flight generation do not re-kick generate', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      let resolveGenerate: () => void = () => undefined
      mockStrategic.generate.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveGenerate = resolve
        }),
      )

      const first =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      const second =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      const third =
        await service.getOrGenerateStrategicLandscape(buildCampaign())

      expect(first).toEqual({ status: 'generating' })
      expect(second).toEqual({ status: 'generating' })
      expect(third).toEqual({ status: 'generating' })
      expect(mockStrategic.generate).toHaveBeenCalledTimes(1)

      resolveGenerate()
      await service.drainInFlight()
    })

    it('once generation completes, the next poll returns ready from cache', async () => {
      mockPrisma.campaignStrategy.findUnique
        .mockResolvedValueOnce(buildPlanRow())
        .mockResolvedValueOnce(cachedPlan())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['x', 'y', 'z'],
        opponents: [],
      })

      const kickoff =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(kickoff).toEqual({ status: 'generating' })

      await service.drainInFlight()

      const followUp =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(followUp.status).toBe('ready')
      if (followUp.status !== 'ready') return
      expect(followUp.data.opportunities).toEqual(['o1', 'o2', 'o3'])
    })

    it('swallows P2002 concurrent-write failures so the next poll picks up the winner', async () => {
      const winnerRow = cachedPlan({
        opportunities: [
          { order: 1, content: 'w1' },
          { order: 2, content: 'w2' },
          { order: 3, content: 'w3' },
        ],
      })
      mockPrisma.campaignStrategy.findUnique
        .mockResolvedValueOnce(buildPlanRow())
        .mockResolvedValueOnce(winnerRow)

      const p2002 = Object.assign(new Error('Unique constraint failed'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
      })
      mockStrategic.generate.mockRejectedValue(p2002)

      const kickoff =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(kickoff).toEqual({ status: 'generating' })

      await service.drainInFlight()

      const followUp =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(followUp.status).toBe('ready')
      if (followUp.status !== 'ready') return
      expect(followUp.data.opportunities).toEqual(['w1', 'w2', 'w3'])
      expect(mockStrategic.generate).toHaveBeenCalledTimes(1)
    })

    it('clears the in-flight slot on non-P2002 failure so the next poll retries', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockRejectedValueOnce(new Error('llm down'))

      const first =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(first).toEqual({ status: 'generating' })
      await service.drainInFlight()

      mockStrategic.generate.mockResolvedValueOnce({
        opportunities: ['a', 'b', 'c'],
        challenges: ['x', 'y', 'z'],
        opponents: [],
      })
      const second =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(second).toEqual({ status: 'generating' })

      await service.drainInFlight()
      expect(mockStrategic.generate).toHaveBeenCalledTimes(2)
    })
  })

  describe('getOrGenerateStrategicLandscape — race context stitching', () => {
    it('falls back to details.otherParty when party is "Other"', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({
          details: {
            party: 'Other',
            otherParty: 'Pirate Party',
            raceId: 'hash-abc',
          },
        }),
      )
      await service.drainInFlight()

      expect(mockStrategic.generate).toHaveBeenCalledWith(
        42,
        99,
        expect.objectContaining({ userPartyAffiliation: 'Pirate Party' }),
      )
    })

    it('returns empty userPartyAffiliation when party is "Other" but otherParty is missing', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({
          details: { party: 'Other', raceId: 'hash-abc' },
        }),
      )
      await service.drainInFlight()

      expect(mockStrategic.generate).toHaveBeenCalledWith(
        42,
        99,
        expect.objectContaining({ userPartyAffiliation: '' }),
      )
    })

    it('uses details.party verbatim when not "Other"', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({ details: { party: 'Green', raceId: 'hash-abc' } }),
      )
      await service.drainInFlight()

      expect(mockStrategic.generate).toHaveBeenCalledWith(
        42,
        99,
        expect.objectContaining({ userPartyAffiliation: 'Green' }),
      )
    })

    it('derives userFullName via firstName + lastName, falling back to name', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({
          user: {
            id: 1,
            firstName: null,
            lastName: null,
            name: 'Solo Name',
            email: 'solo@example.com',
          } as User,
        }),
      )
      await service.drainInFlight()

      expect(mockStrategic.generate).toHaveBeenCalledWith(
        42,
        99,
        expect.objectContaining({ userFullName: 'Solo Name' }),
      )
    })

    it('flags the candidate matching the user email as isUser=true', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(buildCampaign())
      await service.drainInFlight()

      const call = mockStrategic.generate.mock.calls[0]
      const candidates = (
        call[2] as { candidates: Array<{ fullName: string; isUser: boolean }> }
      ).candidates
      const flagged = candidates.filter((c) => c.isUser)
      expect(flagged).toHaveLength(1)
      expect(flagged[0].fullName).toBe('Jane Doe')
    })

    it('matches by email case-insensitively', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({
          user: {
            id: 1,
            firstName: 'Jane',
            lastName: 'Doe',
            name: 'Jane Doe',
            email: 'JANE@EXAMPLE.COM',
          } as User,
        }),
      )
      await service.drainInFlight()

      const call = mockStrategic.generate.mock.calls[0]
      const candidates = (
        call[2] as { candidates: Array<{ fullName: string; isUser: boolean }> }
      ).candidates
      expect(candidates.find((c) => c.fullName === 'Jane Doe')?.isUser).toBe(
        true,
      )
    })

    it('falls back to full_name match when the candidate email is null', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      mockElectionApi.getRaceContext.mockResolvedValueOnce({
        ...apiCtx,
        candidates: [
          {
            gpCandidateId: 'z',
            firstName: 'Jane',
            lastName: 'Doe',
            fullName: 'Jane Doe',
            email: null,
            websiteUrl: null,
            party: null,
            isIncumbent: null,
          },
        ],
        candidateCount: 1,
      })

      await service.getOrGenerateStrategicLandscape(buildCampaign())
      await service.drainInFlight()

      const call = mockStrategic.generate.mock.calls[0]
      const candidates = (
        call[2] as { candidates: Array<{ fullName: string; isUser: boolean }> }
      ).candidates
      expect(candidates[0].isUser).toBe(true)
    })

    it('collapses internal whitespace before matching by name', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      mockElectionApi.getRaceContext.mockResolvedValueOnce({
        ...apiCtx,
        candidates: [
          {
            gpCandidateId: 'z',
            firstName: 'Rose ',
            lastName: 'Ashton ',
            fullName: 'Rose  Ashton ',
            email: null,
            websiteUrl: null,
            party: null,
            isIncumbent: null,
          },
        ],
        candidateCount: 1,
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({
          user: {
            id: 1,
            firstName: 'Rose',
            lastName: 'Ashton',
            name: 'Rose Ashton',
            email: null as string | null,
          } as User,
        }),
      )
      await service.drainInFlight()

      const call = mockStrategic.generate.mock.calls[0]
      const candidates = (
        call[2] as { candidates: Array<{ fullName: string; isUser: boolean }> }
      ).candidates
      expect(candidates[0].isUser).toBe(true)
    })

    it('flags no candidate when no email or name match', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({
          user: {
            id: 1,
            firstName: 'No',
            lastName: 'Match',
            name: 'No Match',
            email: 'nomatch@example.com',
          } as User,
        }),
      )
      await service.drainInFlight()

      const call = mockStrategic.generate.mock.calls[0]
      const candidates = (
        call[2] as { candidates: Array<{ fullName: string; isUser: boolean }> }
      ).candidates
      expect(candidates.every((c) => !c.isUser)).toBe(true)
    })
  })

  describe('getOrGenerateStrategicLandscape — preconditions', () => {
    it('throws BadRequest when campaign.details has no raceId', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())

      await expect(
        service.getOrGenerateStrategicLandscape(
          buildCampaign({ details: { party: 'Independent' } }),
        ),
      ).rejects.toThrow(BadRequestException)
      expect(mockElectionApi.getRaceContext).not.toHaveBeenCalled()
      expect(mockStrategic.generate).not.toHaveBeenCalled()
    })

    it('throws BadRequest when campaign.details.raceId is whitespace-only', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())

      await expect(
        service.getOrGenerateStrategicLandscape(
          buildCampaign({
            details: { party: 'Independent', raceId: '   ' },
          }),
        ),
      ).rejects.toThrow(BadRequestException)
      expect(mockElectionApi.getRaceContext).not.toHaveBeenCalled()
    })
  })
})
