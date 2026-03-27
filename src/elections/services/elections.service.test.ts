import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { HttpService } from '@nestjs/axios'
import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { of } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PositionWithOptionalDistrict } from '../types/elections.types'
import { ElectionsService } from './elections.service'

const makePosition = (
  turnoutValue: number | null,
): PositionWithOptionalDistrict => ({
  id: 'pos-1',
  brPositionId: 'br-pos-1',
  brDatabaseId: 'br-db-1',
  state: 'TX',
  name: 'State House 005',
  district: {
    id: 'district-1',
    L2DistrictType: 'State_House',
    L2DistrictName: 'STATE HOUSE 005',
    projectedTurnout:
      turnoutValue !== null
        ? {
            id: 'pt-1',
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            electionYear: 2024,
            electionCode: 'General' as never,
            projectedTurnout: turnoutValue,
            inferenceAt: new Date('2024-01-01'),
            modelVersion: 'v1',
            districtId: 'district-1',
          }
        : null,
  },
})

describe('ElectionsService', () => {
  let service: ElectionsService
  let mockHttpGet: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    process.env.ELECTION_API_URL = 'http://test-election-api'

    mockHttpGet = vi.fn()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElectionsService,
        { provide: PinoLogger, useValue: createMockLogger() },
        {
          provide: HttpService,
          useValue: { get: mockHttpGet },
        },
        {
          provide: SlackService,
          useValue: {
            formattedMessage: vi.fn().mockResolvedValue(undefined),
            errorMessage: vi.fn().mockResolvedValue(undefined),
            message: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile()

    service = module.get<ElectionsService>(ElectionsService)

    const mockLogger = createMockLogger()
    Object.defineProperty(service, 'logger', {
      get: () => mockLogger,
      configurable: true,
    })

    vi.clearAllMocks()
  })

  describe('getPositionMatchedRaceTargetDetails', () => {
    const brIdParams = {
      ballotreadyPositionId: 'br-pos-1',
      electionDate: '2024-11-05',
      includeTurnout: true,
      campaignId: 123,
      officeName: 'City Council',
    }

    const gpIdParams = {
      positionId: 'pos-1',
      electionDate: '2024-11-05',
      includeTurnout: true,
      campaignId: 456,
      officeName: undefined,
    }

    it('returns calculated metrics when district and turnout are present (BR ID)', async () => {
      mockHttpGet.mockReturnValue(of({ data: makePosition(1000), status: 200 }))

      const { district, projectedTurnout, winNumber, voterContactGoal } =
        await service.getPositionMatchedRaceTargetDetails(brIdParams)

      expect(district?.L2DistrictType).toBe('State_House')
      expect(district?.L2DistrictName).toBe('STATE HOUSE 005')
      expect(projectedTurnout).toBe(1000)
      expect(winNumber).toBe(501)
      expect(voterContactGoal).toBe(2505)
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('positions/by-ballotready-id/br-pos-1'),
        expect.anything(),
      )
    })

    it('returns calculated metrics when district and turnout are present (GP ID)', async () => {
      mockHttpGet.mockReturnValue(of({ data: makePosition(1000), status: 200 }))

      const { district, projectedTurnout, winNumber, voterContactGoal } =
        await service.getPositionMatchedRaceTargetDetails(gpIdParams)

      expect(district?.L2DistrictType).toBe('State_House')
      expect(district?.L2DistrictName).toBe('STATE HOUSE 005')
      expect(projectedTurnout).toBe(1000)
      expect(winNumber).toBe(501)
      expect(voterContactGoal).toBe(2505)
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('positions/pos-1'),
        expect.anything(),
      )
    })

    it('returns district with sentinel values when turnout is null', async () => {
      mockHttpGet.mockReturnValue(of({ data: makePosition(null), status: 200 }))

      const { district, winNumber, voterContactGoal, projectedTurnout } =
        await service.getPositionMatchedRaceTargetDetails(brIdParams)

      expect(district?.L2DistrictType).toBe('State_House')
      expect(district?.L2DistrictName).toBe('STATE HOUSE 005')
      expect(winNumber).toBe(-1)
      expect(voterContactGoal).toBe(-1)
      expect(projectedTurnout).toBe(-1)
    })

    it('throws NotFoundException when API returns position without district', async () => {
      const positionNoDistrict: PositionWithOptionalDistrict = {
        id: 'pos-1',
        brPositionId: 'br-pos-1',
        brDatabaseId: 'br-db-1',
        state: 'TX',
        name: 'State House 005',
      }
      mockHttpGet.mockReturnValue(of({ data: positionNoDistrict, status: 200 }))

      await expect(
        service.getPositionMatchedRaceTargetDetails(brIdParams),
      ).rejects.toThrow(
        new NotFoundException(
          'No position and/or associated district was found',
        ),
      )
    })

    it('throws NotFoundException when API returns null', async () => {
      mockHttpGet.mockReturnValue(of({ data: null, status: 200 }))

      await expect(
        service.getPositionMatchedRaceTargetDetails(brIdParams),
      ).rejects.toThrow(
        new NotFoundException(
          'No position and/or associated district was found',
        ),
      )
    })
  })

  describe('getPositionByBallotReadyId', () => {
    it('returns position with district when includeDistrict is true', async () => {
      const position = makePosition(1000)
      mockHttpGet.mockReturnValue(of({ data: position, status: 200 }))

      const result = await service.getPositionByBallotReadyId('br-pos-1', {
        includeDistrict: true,
      })

      expect(result).toEqual(position)
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('positions/by-ballotready-id/br-pos-1'),
        expect.objectContaining({
          params: { includeDistrict: true, includeTurnout: false },
        }),
      )
    })

    it('returns position without district by default', async () => {
      const position: PositionWithOptionalDistrict = {
        id: 'pos-1',
        brPositionId: 'br-pos-1',
        brDatabaseId: 'br-db-1',
        state: 'TX',
        name: 'State House 005',
      }
      mockHttpGet.mockReturnValue(of({ data: position, status: 200 }))

      const result = await service.getPositionByBallotReadyId('br-pos-1')

      expect(result).toEqual(position)
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('positions/by-ballotready-id/br-pos-1'),
        expect.objectContaining({
          params: { includeDistrict: false, includeTurnout: false },
        }),
      )
    })

    it('returns null when API returns null', async () => {
      mockHttpGet.mockReturnValue(of({ data: null, status: 200 }))

      const result = await service.getPositionByBallotReadyId('br-nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('getDistrictId', () => {
    it('returns district id when API returns results', async () => {
      mockHttpGet.mockReturnValue(
        of({ data: [{ id: 'district-uuid-1' }], status: 200 }),
      )

      const result = await service.getDistrictId('CA', 'City', 'Los Angeles')

      expect(result).toBe('district-uuid-1')
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('districts/list'),
        expect.objectContaining({
          params: {
            state: 'CA',
            L2DistrictType: 'City',
            L2DistrictName: 'Los Angeles',
            districtColumns: 'id',
          },
        }),
      )
    })

    it('returns null when API returns empty array', async () => {
      mockHttpGet.mockReturnValue(of({ data: [], status: 200 }))

      const result = await service.getDistrictId(
        'CA',
        'City',
        'Nonexistent City',
      )

      expect(result).toBeNull()
    })

    it('returns null when API returns null', async () => {
      mockHttpGet.mockReturnValue(of({ data: null, status: 200 }))

      const result = await service.getDistrictId('CA', 'City', 'Test')

      expect(result).toBeNull()
    })

    it('throws when API throws', async () => {
      mockHttpGet.mockImplementation(() => {
        throw new Error('Network error')
      })

      await expect(
        service.getDistrictId('CA', 'City', 'Test'),
      ).rejects.toThrow()
    })

    it('cleans district name with ## separators', async () => {
      mockHttpGet.mockReturnValue(
        of({ data: [{ id: 'district-cleaned' }], status: 200 }),
      )

      await service.getDistrictId(
        'CA',
        'State Senate',
        'Short ## Much Longer District Name',
      )

      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('districts/list'),
        expect.objectContaining({
          params: expect.objectContaining({
            L2DistrictName: 'Much Longer District Name',
          }),
        }),
      )
    })
  })

  describe('buildRaceTargetDetails with districtId', () => {
    it('returns metrics when election-api returns valid turnout via districtId', async () => {
      mockHttpGet.mockReturnValue(
        of({
          data: { projectedTurnout: 5000, L2DistrictType: 'City', L2DistrictName: 'Ward 1' },
          status: 200,
        }),
      )

      const result = await service.buildRaceTargetDetails({
        districtId: 'district-uuid',
        electionDate: '2024-11-05',
      })

      expect(result).toEqual(
        expect.objectContaining({
          projectedTurnout: 5000,
          winNumber: 2501,
          voterContactGoal: 12505,
        }),
      )
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('projectedTurnout'),
        expect.objectContaining({
          params: { districtId: 'district-uuid', electionDate: '2024-11-05' },
        }),
      )
    })

    it('returns null when election-api returns null via districtId', async () => {
      mockHttpGet.mockReturnValue(of({ data: null, status: 200 }))

      const result = await service.buildRaceTargetDetails({
        districtId: 'district-uuid',
        electionDate: '2024-11-05',
      })

      expect(result).toBeNull()
    })

    it('returns null when election-api throws via districtId', async () => {
      mockHttpGet.mockImplementation(() => {
        throw new Error('Network error')
      })

      const result = await service.buildRaceTargetDetails({
        districtId: 'district-uuid',
        electionDate: '2024-11-05',
      })

      expect(result).toBeNull()
    })

    it('does not apply cleanDistrictName when using districtId', async () => {
      mockHttpGet.mockReturnValue(
        of({
          data: { projectedTurnout: 3000 },
          status: 200,
        }),
      )

      await service.buildRaceTargetDetails({
        districtId: 'district-uuid',
        electionDate: '2024-11-05',
      })

      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('projectedTurnout'),
        expect.objectContaining({
          params: { districtId: 'district-uuid', electionDate: '2024-11-05' },
        }),
      )
    })
  })

  describe('cleanDistrictName', () => {
    it('returns original name when no ## separator', () => {
      expect(service.cleanDistrictName('Los Angeles')).toBe('Los Angeles')
    })

    it('returns longest segment when ## separator present', () => {
      expect(service.cleanDistrictName('Short ## Much Longer Name')).toBe(
        'Much Longer Name',
      )
    })

    it('handles multiple ## segments', () => {
      expect(
        service.cleanDistrictName(
          'A ## Medium Len ## The Longest Segment Here',
        ),
      ).toBe('The Longest Segment Here')
    })

    it('trims whitespace from segments', () => {
      expect(service.cleanDistrictName('  Short  ##  Longer Name  ')).toBe(
        'Longer Name',
      )
    })

    it('filters out empty segments', () => {
      expect(service.cleanDistrictName('## ## Valid Name')).toBe('Valid Name')
    })

    it('returns original when all segments are empty', () => {
      expect(service.cleanDistrictName('## ##')).toBe('## ##')
    })
  })
})
