import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Test, type TestingModule } from '@nestjs/testing'
import { Campaign, User } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'src/prisma/prisma.service'
import { CampaignStrategyService } from './campaignStrategy.service'
import { ElectionApiMockService } from './electionApiMock.service'
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
    details: { party: 'Independent' },
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
    mockElectionApi = { getRaceContext: vi.fn().mockReturnValue(apiCtx) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StrategicLandscapeService, useValue: mockStrategic },
        { provide: ElectionApiMockService, useValue: mockElectionApi },
        { provide: PinoLogger, useValue: createMockLogger() },
        CampaignStrategyService,
      ],
    }).compile()
    await module.init()

    service = module.get<CampaignStrategyService>(CampaignStrategyService)
  })

  describe('getOrGenerateStrategicLandscape', () => {
    it('returns cached data when opportunities already exist', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(
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

      expect(result.opportunities).toEqual(['o1', 'o2', 'o3'])
      expect(result.challenges).toEqual(['c1', 'c2', 'c3'])
      expect(result.opponents).toEqual([
        {
          fullName: 'Bob',
          partyAffiliation: 'Nonpartisan',
          incumbent: true,
          politicalSummary: 'background',
          keyFacts: ['fact1'],
          websites: ['https://bob.example'],
        },
      ])
      expect(mockStrategic.generate).not.toHaveBeenCalled()
    })

    it('generates and returns fresh data when no opportunities exist', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['x', 'y', 'z'],
        opponents: [],
      })

      const result =
        await service.getOrGenerateStrategicLandscape(buildCampaign())

      expect(result.opportunities).toEqual(['a', 'b', 'c'])
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
      expect(mockElectionApi.getRaceContext).toHaveBeenCalledWith(99)
    })

    it('falls back to the cached read when a concurrent write trips P2002', async () => {
      const winnerRow = buildPlanRow({
        opportunities: [
          { order: 1, content: 'w1' },
          { order: 2, content: 'w2' },
          { order: 3, content: 'w3' },
        ],
        challenges: [
          { order: 1, content: 'c1' },
          { order: 2, content: 'c2' },
          { order: 3, content: 'c3' },
        ],
        opponents: [],
      })
      mockPrisma.campaignStrategy.findUnique
        .mockResolvedValueOnce(buildPlanRow())
        .mockResolvedValueOnce(winnerRow)

      const p2002 = Object.assign(new Error('Unique constraint failed'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
      })
      mockStrategic.generate.mockRejectedValue(p2002)

      const result =
        await service.getOrGenerateStrategicLandscape(buildCampaign())

      expect(result.opportunities).toEqual(['w1', 'w2', 'w3'])
      expect(mockStrategic.generate).toHaveBeenCalledTimes(1)
    })

    it('falls back to details.otherParty when party is "Other"', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({
          details: { party: 'Other', otherParty: 'Pirate Party' },
        }),
      )

      expect(mockStrategic.generate).toHaveBeenCalledWith(
        42,
        99,
        expect.objectContaining({ userPartyAffiliation: 'Pirate Party' }),
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
        buildCampaign({ details: { party: 'Green' } }),
      )

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

      expect(mockStrategic.generate).toHaveBeenCalledWith(
        42,
        99,
        expect.objectContaining({ userFullName: 'Solo Name' }),
      )
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

      expect(result.challenges).toEqual(['c1', 'c2', 'c3'])
      expect(result.opportunities).toEqual([])
      expect(mockStrategic.generate).not.toHaveBeenCalled()
    })

    it('regenerates only when no section has any content', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['fresh'],
        challenges: ['fresh'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(buildCampaign())

      expect(mockStrategic.generate).toHaveBeenCalledTimes(1)
    })

    it('flags the candidate matching the user email as isUser=true', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(buildCampaign())

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

      mockElectionApi.getRaceContext.mockReturnValueOnce({
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

      // Candidate seeded with double-space; user fullName has single space.
      mockElectionApi.getRaceContext.mockReturnValueOnce({
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

      const call = mockStrategic.generate.mock.calls[0]
      const candidates = (
        call[2] as { candidates: Array<{ fullName: string; isUser: boolean }> }
      ).candidates
      expect(candidates.every((c) => !c.isUser)).toBe(true)
    })

    it('re-throws non-P2002 errors from generate', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockRejectedValue(new Error('llm down'))

      await expect(
        service.getOrGenerateStrategicLandscape(buildCampaign()),
      ).rejects.toThrow('llm down')
    })
  })
})
