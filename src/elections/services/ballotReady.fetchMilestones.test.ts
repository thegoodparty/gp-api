import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BallotReadyMilestone } from '../types/ballotReady.types'
import { BallotReadyService, collapseMilestones } from './ballotReady.service'

// BR's Milestone.date is `ISO8601Date` per introspection — a calendar
// date string like '2026-09-01' with no time / offset component. All
// fixtures here use that shape.

describe('collapseMilestones', () => {
  it('groups milestones by category and picks earliest OPEN / latest CLOSE', () => {
    const input: BallotReadyMilestone[] = [
      // REGISTRATION: two CLOSE rows (different features) + one OPEN
      { category: 'REGISTRATION', type: 'OPEN', date: '2026-01-01' },
      { category: 'REGISTRATION', type: 'CLOSE', date: '2026-09-01' },
      { category: 'REGISTRATION', type: 'CLOSE', date: '2026-08-15' },
      // EARLY_VOTING: only OPEN
      { category: 'EARLY_VOTING', type: 'OPEN', date: '2026-08-20' },
      // REQUEST_BALLOT: only CLOSE
      { category: 'REQUEST_BALLOT', type: 'CLOSE', date: '2026-08-30' },
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
      { category: 'VOTING', type: 'OPEN', date: '2026-09-01' },
      { category: 'FILING', type: 'CLOSE', date: '2026-06-01' },
      { category: 'WHATEVER', type: 'OPEN', date: '2026-05-01' },
    ])
    expect(result.voter_registration).toBeNull()
    expect(result.early_voting).toBeNull()
    expect(result.request_ballot).toBeNull()
  })

  // BR's schema marks `date` as NON_NULL, but we treat a missing/empty
  // value defensively (the type-checked falsy guard in the service is
  // belt-and-suspenders against a schema change or transport corruption).
  it('skips entries with falsy date', () => {
    const result = collapseMilestones([
      { category: 'REGISTRATION', type: 'OPEN', date: '' },
      { category: 'REGISTRATION', type: 'CLOSE', date: '2026-08-15' },
    ])
    expect(result.voter_registration).toEqual({
      start: null,
      end: '2026-08-15',
    })
  })

  // For ISO8601Date strings (yyyy-MM-dd) string compare and chronological
  // compare are equivalent — this test pins that BR's actual date format
  // gives the expected min/max behavior regardless of which underlying
  // comparator we use.
  it('selects min open / max close across an unsorted input', () => {
    const result = collapseMilestones([
      { category: 'EARLY_VOTING', type: 'OPEN', date: '2026-10-25' },
      { category: 'EARLY_VOTING', type: 'OPEN', date: '2026-10-20' },
      { category: 'EARLY_VOTING', type: 'OPEN', date: '2026-10-22' },
      { category: 'EARLY_VOTING', type: 'CLOSE', date: '2026-11-01' },
      { category: 'EARLY_VOTING', type: 'CLOSE', date: '2026-11-03' },
      { category: 'EARLY_VOTING', type: 'CLOSE', date: '2026-11-02' },
    ])
    expect(result.early_voting).toEqual({
      start: '2026-10-20',
      end: '2026-11-03',
    })
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
            { category: 'REGISTRATION', type: 'CLOSE', date: '2026-09-01' },
            { category: 'EARLY_VOTING', type: 'OPEN', date: '2026-08-20' },
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

  it('returns null when node is null (unknown raceId)', async () => {
    mockRequest.mockResolvedValue({ node: null })
    const result = await service.fetchMilestones('br-hash-unknown')
    expect(result).toBeNull()
  })

  it('returns null when node.election is null (race not linked to an Election)', async () => {
    mockRequest.mockResolvedValue({ node: { election: null } })
    const result = await service.fetchMilestones('br-hash-no-election')
    expect(result).toBeNull()
  })
})
