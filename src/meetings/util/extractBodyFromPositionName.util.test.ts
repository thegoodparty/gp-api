import { describe, expect, it } from 'vitest'
import { extractBodyFromPositionName } from './extractBodyFromPositionName.util'

describe('extractBodyFromPositionName', () => {
  it.each([
    ['St. Hilaire City Council', 'City Council'],
    ['Chicago City Council - Ward 50', 'City Council'],
    [
      'Polk County: Clay Township Clerk',
      'Clay Township Clerk',
    ],
    ['Dane County: Rutland Town Board', 'Town Board'],
    ['Wake County School Board - District 6', 'School Board'],
    ['Allen Parish Police Juror - District 8', 'Police Jury'],
    ['"Branch City Council - Ward 3, Position 2"', 'City Council'],
    ['Vice President of the United States', 'Vice President of the United States'],
    ['', 'Unknown'],
    ['   ', 'Unknown'],
  ])('%s → %s', (input, expected) => {
    expect(extractBodyFromPositionName(input)).toBe(expected)
  })
})
