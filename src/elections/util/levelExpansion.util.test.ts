import { describe, expect, it } from 'vitest'
import { expandLevelToDisplayLevels } from './levelExpansion.util'

describe('expandLevelToDisplayLevels', () => {
  it('expands LOCAL', () => {
    expect(expandLevelToDisplayLevels('Local')).toEqual([
      'Local',
      'Township',
      'Village',
    ])
  })
  it('expands COUNTY', () => {
    expect(expandLevelToDisplayLevels('County')).toEqual(['County', 'Regional'])
  })
  it('returns undefined when no level', () => {
    expect(expandLevelToDisplayLevels(undefined)).toBeUndefined()
  })
  it('falls back to literal for unknown level', () => {
    expect(expandLevelToDisplayLevels('Unknown')).toEqual(['Unknown'])
  })
})
