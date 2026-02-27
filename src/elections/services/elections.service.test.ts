import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { PinoLogger } from 'nestjs-pino'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { HttpService } from '@nestjs/axios'
import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { of } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PositionWithOptionalDistrict } from '../types/elections.types'
import { ElectionsService } from './elections.service'

const makePosition = (
  turnoutValue: number | null,
): PositionWithOptionalDistrict => ({
  positionId: 'pos-1',
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

  describe('getBallotReadyMatchedRaceTargetDetails', () => {
    const defaultParams = {
      ballotreadyPositionId: 'br-pos-1',
      electionDate: '2024-11-05',
      includeTurnout: true,
      campaignId: 123,
      officeName: 'City Council',
    }

    it('returns calculated metrics when district and turnout are present', async () => {
      mockHttpGet.mockReturnValue(of({ data: makePosition(1000), status: 200 }))

      const result =
        await service.getBallotReadyMatchedRaceTargetDetails(defaultParams)

      expect(result.district?.L2DistrictType).toBe('State_House')
      expect(result.district?.L2DistrictName).toBe('STATE HOUSE 005')
      expect(result.projectedTurnout).toBe(1000)
      expect(result.winNumber).toBe(501)
      expect(result.voterContactGoal).toBe(2505)
    })

    it('returns district with sentinel values when turnout is null', async () => {
      mockHttpGet.mockReturnValue(of({ data: makePosition(null), status: 200 }))

      const result =
        await service.getBallotReadyMatchedRaceTargetDetails(defaultParams)

      expect(result.district?.L2DistrictType).toBe('State_House')
      expect(result.district?.L2DistrictName).toBe('STATE HOUSE 005')
      expect(result.winNumber).toBe(-1)
      expect(result.voterContactGoal).toBe(-1)
      expect(result.projectedTurnout).toBe(-1)
    })

    it('throws NotFoundException when API returns position without district', async () => {
      const positionNoDistrict: PositionWithOptionalDistrict = {
        positionId: 'pos-1',
        brPositionId: 'br-pos-1',
        brDatabaseId: 'br-db-1',
        state: 'TX',
        name: 'State House 005',
      }
      mockHttpGet.mockReturnValue(of({ data: positionNoDistrict, status: 200 }))

      await expect(
        service.getBallotReadyMatchedRaceTargetDetails(defaultParams),
      ).rejects.toThrow(
        new NotFoundException(
          'No position and/or associated district was found',
        ),
      )
    })

    it('throws NotFoundException when API returns null', async () => {
      mockHttpGet.mockReturnValue(of({ data: null, status: 200 }))

      await expect(
        service.getBallotReadyMatchedRaceTargetDetails(defaultParams),
      ).rejects.toThrow(
        new NotFoundException(
          'No position and/or associated district was found',
        ),
      )
    })
  })
})
