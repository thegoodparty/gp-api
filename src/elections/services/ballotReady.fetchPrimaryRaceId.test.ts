import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BallotReadyService } from './ballotReady.service'

const GENERAL_DAY = '2026-11-03'
const GENERAL_RACE = 'br-general'

// The shape fetchPrimaryRaceId reads off fetchRaceById's result.
const general = (position: unknown, electionDay: string = GENERAL_DAY) => ({
  node: { position, election: { electionDay } },
})

// The shape the second GraphQL query returns.
const edges = (...nodes: unknown[]) => ({
  node: { races: { edges: nodes.map((node) => ({ node })) } },
})

describe('BallotReadyService.fetchPrimaryRaceId', () => {
  let service: BallotReadyService
  let request: ReturnType<typeof vi.fn>
  let fetchRaceById: ReturnType<typeof vi.fn>

  beforeEach(() => {
    service = new BallotReadyService(createMockLogger())
    request = vi.fn()
    Object.defineProperty(service, 'graphQLClient', {
      value: { request },
      configurable: true,
    })
    // default: a valid general race with a primary; the early-return tests
    // override it.
    fetchRaceById = vi
      .fn()
      .mockResolvedValue(general({ id: 'pos-1', hasPrimary: true }))
    Object.defineProperty(service, 'fetchRaceById', {
      value: fetchRaceById,
      configurable: true,
    })
  })

  it('returns null (no query) when the general race has no positionId', async () => {
    fetchRaceById.mockResolvedValue(general({ hasPrimary: true }))
    expect(await service.fetchPrimaryRaceId(GENERAL_RACE)).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('returns null (no query) when the position has no primary', async () => {
    fetchRaceById.mockResolvedValue(general({ id: 'pos-1', hasPrimary: false }))
    expect(await service.fetchPrimaryRaceId(GENERAL_RACE)).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('returns null (no query) when the general election day is missing', async () => {
    fetchRaceById.mockResolvedValue(
      general({ id: 'pos-1', hasPrimary: true }, ''),
    )
    expect(await service.fetchPrimaryRaceId(GENERAL_RACE)).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('returns null when the primary query has no edges', async () => {
    request.mockResolvedValue(edges())
    expect(await service.fetchPrimaryRaceId(GENERAL_RACE)).toBeNull()
  })

  it('returns null when no edge is a distinct primary', async () => {
    // one non-primary, one primary but on the general day (filtered out)
    request.mockResolvedValue(
      edges(
        {
          id: 'p-1',
          isPrimary: false,
          election: { electionDay: '2026-06-02' },
        },
        { id: 'p-2', isPrimary: true, election: { electionDay: GENERAL_DAY } },
      ),
    )
    expect(await service.fetchPrimaryRaceId(GENERAL_RACE)).toBeNull()
  })

  it('returns the earliest distinct primary race id', async () => {
    request.mockResolvedValue(
      edges(
        {
          id: 'p-jun',
          isPrimary: true,
          election: { electionDay: '2026-06-02' },
        },
        {
          id: 'p-mar',
          isPrimary: true,
          election: { electionDay: '2026-03-01' },
        },
      ),
    )
    expect(await service.fetchPrimaryRaceId(GENERAL_RACE)).toBe('p-mar')
  })

  it('returns null when the primary query throws', async () => {
    request.mockRejectedValue(new Error('boom'))
    expect(await service.fetchPrimaryRaceId(GENERAL_RACE)).toBeNull()
  })
})
