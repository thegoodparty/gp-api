import { describe, expect, it } from 'vitest'
import { getVoterIssueLevelFromPositionLevel } from './getVoterIssueLevelFromPositionLevel.util'

describe('getVoterIssueLevelFromPositionLevel', () => {
  it.each([
    ['CITY', 'local'] as const,
    ['TOWNSHIP', 'local'] as const,
    ['LOCAL', 'local'] as const,
    ['COUNTY', 'regional'] as const,
    ['REGIONAL', 'regional'] as const,
    ['STATE', 'state'] as const,
    ['FEDERAL', 'federal'] as const,
  ])('maps position level %s to voter-issue level %s', (level, expected) => {
    expect(getVoterIssueLevelFromPositionLevel(level)).toBe(expected)
  })

  it('returns null for null', () => {
    expect(getVoterIssueLevelFromPositionLevel(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(getVoterIssueLevelFromPositionLevel(undefined)).toBeNull()
  })
})
