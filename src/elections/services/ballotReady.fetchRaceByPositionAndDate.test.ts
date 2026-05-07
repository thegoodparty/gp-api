import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BallotReadyService } from './ballotReady.service'

describe('BallotReadyService.fetchRaceByPositionAndDate', () => {
  let service: BallotReadyService
  let mockRequest: ReturnType<typeof vi.fn>

  beforeEach(() => {
    service = new BallotReadyService(createMockLogger())
    mockRequest = vi.fn()
    Object.defineProperty(service, 'graphQLClient', {
      value: { request: mockRequest },
      configurable: true,
    })
  })

  it('returns the first edge node when BR returns data', async () => {
    const raceNode = {
      id: 'race-1',
      isPrimary: false,
      filingPeriods: [{ startOn: '2024-01-01', endOn: '2024-02-01' }],
      election: {
        id: 'election-1',
        electionDay: '2024-11-05',
        name: 'General',
        originalElectionDate: '2024-11-05',
        state: 'CA',
        timezone: 'America/Los_Angeles',
      },
      position: {
        id: 'br-pos-1',
        appointed: false,
        geoId: 'g-1',
        mtfcc: 'G4110',
        hasPrimary: true,
        partisanType: 'partisan',
        level: 'CITY',
        name: 'Mayor',
        salary: null,
        state: 'CA',
        subAreaName: null,
        subAreaValue: null,
        electionFrequencies: [{ frequency: [4] }],
        normalizedPosition: { name: 'Mayor' },
        tier: 3,
      },
    }
    mockRequest.mockResolvedValue({
      node: { races: { edges: [{ node: raceNode }] } },
    })

    const result = await service.fetchRaceByPositionAndDate({
      brPositionId: 'br-pos-1',
      electionDate: '2024-11-05',
    })

    expect(result).toEqual(raceNode)
    expect(mockRequest).toHaveBeenCalledTimes(1)
    const [queryArg, variablesArg] = mockRequest.mock.calls[0] as [
      string,
      Record<string, string>,
    ]
    expect(queryArg).not.toContain('br-pos-1')
    expect(variablesArg).toEqual({
      positionId: 'br-pos-1',
      rangeStart: '2024-01-01',
      rangeEnd: '2024-12-31',
    })
  })

  it('returns null when BR returns an empty edges array', async () => {
    mockRequest.mockResolvedValue({
      node: { races: { edges: [] } },
    })

    const result = await service.fetchRaceByPositionAndDate({
      brPositionId: 'br-pos-1',
      electionDate: '2024-11-05',
    })

    expect(result).toBeNull()
  })

  it('rethrows when the GraphQL request fails', async () => {
    const brError = new Error('BR upstream 502')
    mockRequest.mockRejectedValue(brError)

    await expect(
      service.fetchRaceByPositionAndDate({
        brPositionId: 'br-pos-1',
        electionDate: '2024-11-05',
      }),
    ).rejects.toBe(brError)
  })

  it('attaches primaryElectionDate and primaryElectionId from a sibling primary race', async () => {
    const generalNode = {
      id: 'race-general',
      isPrimary: false,
      filingPeriods: [{ startOn: '2024-01-01', endOn: '2024-02-01' }],
      election: {
        id: 'election-general',
        electionDay: '2024-11-05',
        name: 'General',
        originalElectionDate: '2024-11-05',
        state: 'CA',
        timezone: 'America/Los_Angeles',
      },
      position: {
        id: 'br-pos-1',
        appointed: false,
        geoId: 'g-1',
        mtfcc: 'G4110',
        hasPrimary: true,
        partisanType: 'nonpartisan',
        level: 'CITY',
        name: 'Mayor',
        salary: null,
        state: 'CA',
        subAreaName: null,
        subAreaValue: null,
        electionFrequencies: [{ frequency: [4] }],
        normalizedPosition: { name: 'Mayor' },
        tier: 3,
      },
    }
    const primaryNode = {
      ...generalNode,
      id: 'race-primary',
      isPrimary: true,
      election: {
        ...generalNode.election,
        id: 'election-primary',
        electionDay: '2024-06-04',
        name: 'Primary',
        originalElectionDate: '2024-06-04',
      },
    }
    mockRequest.mockResolvedValue({
      node: {
        races: { edges: [{ node: generalNode }, { node: primaryNode }] },
      },
    })

    const result = await service.fetchRaceByPositionAndDate({
      brPositionId: 'br-pos-1',
      electionDate: '2024-11-05',
    })

    expect(result?.id).toBe('race-general')
    expect(result?.election.primaryElectionDate).toBe('2024-06-04')
    expect(result?.election.primaryElectionId).toBe('election-primary')
  })
})
