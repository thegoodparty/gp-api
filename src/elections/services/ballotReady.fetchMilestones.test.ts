import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BallotReadyMilestone } from '../types/ballotReady.types'
import { BallotReadyService, collapseMilestones } from './ballotReady.service'

describe('collapseMilestones', () => {
  it('groups milestones by category and picks earliest OPEN / latest CLOSE', () => {
    const input: BallotReadyMilestone[] = [
      // REGISTRATION: two CLOSE rows (different features) + one OPEN
      { category: 'REGISTRATION', type: 'OPEN', at: '2026-01-01T00:00:00Z' },
      { category: 'REGISTRATION', type: 'CLOSE', at: '2026-09-01T00:00:00Z' },
      { category: 'REGISTRATION', type: 'CLOSE', at: '2026-08-15T00:00:00Z' },
      // EARLY_VOTING: only OPEN
      { category: 'EARLY_VOTING', type: 'OPEN', at: '2026-08-20T00:00:00Z' },
      // REQUEST_BALLOT: only CLOSE
      { category: 'REQUEST_BALLOT', type: 'CLOSE', at: '2026-08-30T00:00:00Z' },
    ]

    const result = collapseMilestones(input)

    expect(result).toEqual({
      voter_registration: { start: '2026-01-01', end: '2026-09-01' },
      early_voting: { start: '2026-08-20', end: null },
      request_ballot: { start: null, end: '2026-08-30' },
    })
  })

  it('returns null for each category when input is empty', () => {
    expect(collapseMilestones([])).toEqual({
      voter_registration: null,
      early_voting: null,
      request_ballot: null,
    })
  })

  it('ignores VOTING / FILING / unknown categories', () => {
    const result = collapseMilestones([
      { category: 'VOTING', type: 'OPEN', at: '2026-09-01T00:00:00Z' },
      { category: 'FILING', type: 'CLOSE', at: '2026-06-01T00:00:00Z' },
      { category: 'WHATEVER', type: 'OPEN', at: '2026-05-01T00:00:00Z' },
    ])
    expect(result.voter_registration).toBeNull()
    expect(result.early_voting).toBeNull()
    expect(result.request_ballot).toBeNull()
  })

  it('skips entries with null at', () => {
    const result = collapseMilestones([
      { category: 'REGISTRATION', type: 'OPEN', at: null },
      { category: 'REGISTRATION', type: 'CLOSE', at: '2026-08-15T00:00:00Z' },
    ])
    expect(result.voter_registration).toEqual({
      start: null,
      end: '2026-08-15',
    })
  })

  // Pins the UTC-projection behavior `toIsoDate` (formatInTimeZone) relies
  // on. A negative-offset datetime late in the local day projects to the
  // next UTC calendar date — important to lock down so a regression
  // (e.g. switching back to slice) is caught.
  it('projects a negative-offset datetime to its UTC calendar date', () => {
    const result = collapseMilestones([
      {
        category: 'REGISTRATION',
        type: 'CLOSE',
        at: '2026-10-19T23:30:00-05:00',
      },
    ])
    // 2026-10-19T23:30:00-05:00 → 2026-10-20T04:30:00Z → date is 2026-10-20
    expect(result.voter_registration).toEqual({
      start: null,
      end: '2026-10-20',
    })
  })

  // The OPEN selector picks the earliest datetime across mixed offsets,
  // not the lexicographically smallest string — same shape catches a
  // regression from compareAsc back to raw `<`/`>`.
  it('compares mixed-offset datetimes by instant, not string order', () => {
    const result = collapseMilestones([
      // 2026-10-19T05:00:00Z — later instant
      {
        category: 'EARLY_VOTING',
        type: 'OPEN',
        at: '2026-10-19T00:00:00-05:00',
      },
      // 2026-10-19T00:00:00Z — earlier instant, but later as a string
      { category: 'EARLY_VOTING', type: 'OPEN', at: '2026-10-19T00:00:00Z' },
    ])
    expect(result.early_voting?.start).toBe('2026-10-19')
  })
})

describe('BallotReadyService.fetchMilestones', () => {
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

  it('returns null when brHashId is empty', async () => {
    const result = await service.fetchMilestones('')
    expect(result).toBeNull()
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it('posts the milestones query and returns collapsed windows', async () => {
    mockRequest.mockResolvedValue({
      node: {
        election: {
          milestones: [
            {
              category: 'REGISTRATION',
              type: 'CLOSE',
              at: '2026-09-01T00:00:00Z',
            },
            {
              category: 'EARLY_VOTING',
              type: 'OPEN',
              at: '2026-08-20T00:00:00Z',
            },
          ],
        },
      },
    })

    const result = await service.fetchMilestones('br-hash-1')

    expect(mockRequest).toHaveBeenCalledOnce()
    const [, variables] = mockRequest.mock.calls[0]
    expect(variables).toEqual({ raceId: 'br-hash-1' })
    expect(result).toEqual({
      voter_registration: { start: null, end: '2026-09-01' },
      early_voting: { start: '2026-08-20', end: null },
      request_ballot: null,
    })
  })

  it('returns null when the GraphQL request throws', async () => {
    mockRequest.mockRejectedValue(new Error('upstream down'))
    const result = await service.fetchMilestones('br-hash-1')
    expect(result).toBeNull()
  })

  it('returns all-null windows when BR returns no milestones', async () => {
    mockRequest.mockResolvedValue({
      node: { election: { milestones: [] } },
    })
    const result = await service.fetchMilestones('br-hash-1')
    expect(result).toEqual({
      voter_registration: null,
      early_voting: null,
      request_ballot: null,
    })
  })

  it('returns all-null windows when node is null (unknown raceId)', async () => {
    mockRequest.mockResolvedValue({ node: null })
    const result = await service.fetchMilestones('br-hash-unknown')
    expect(result).toEqual({
      voter_registration: null,
      early_voting: null,
      request_ballot: null,
    })
  })
})
