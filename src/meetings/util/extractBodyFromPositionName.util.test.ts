import { describe, expect, it } from 'vitest'
import { extractBodyFromPositionName } from './extractBodyFromPositionName.util'

describe('extractBodyFromPositionName', () => {
  describe('Tier 1 — body keyword matches', () => {
    it.each([
      ['St. Hilaire City Council', 'City Council'],
      ['Chicago City Council - Ward 50', 'City Council'],
      ['Dane County: Rutland Town Board', 'Town Board'],
      ['Wake County School Board - District 6', 'School Board'],
      ['"Branch City Council - Ward 3, Position 2"', 'City Council'],
      // New Tier 1 bodies
      ['Boston Board of Aldermen', 'Board of Aldermen'],
      ['Lexington Select Board', 'Select Board'],
      ['Manchester Board of Mayor and Aldermen', 'Board of Mayor and Aldermen'],
      ['Albany Common Council', 'Common Council'],
      ['Foo City Aldermanic Council', 'Aldermanic Council'],
      ['Foo Council of the City of Bar', 'Council of the City'],
      ['Springfield Common Council - Ward 3', 'Common Council'],
      // Tier 1 alias — truncated phrase still resolves to canonical body
      ['Manchester Board of Mayor', 'Board of Mayor and Aldermen'],
    ])('%s → %s', (input, expected) => {
      expect(extractBodyFromPositionName(input)).toBe(expected)
    })
  })

  describe('Police juror regex', () => {
    it('Allen Parish Police Juror - District 8 → Police Jury', () => {
      expect(
        extractBodyFromPositionName('Allen Parish Police Juror - District 8'),
      ).toBe('Police Jury')
    })
  })

  describe('Tier 2 — role-to-body inference', () => {
    it.each([
      // Polk County: Clay Township Clerk → previously fell through to the
      // cleaned name; now resolves via Township Clerk role inference.
      ['Polk County: Clay Township Clerk', 'Township Board'],
      ['Springfield Mayor', 'City Council'],
      ['Foo Village President', 'Village Board'],
      ['Bar Town Chair', 'Town Board'],
      ['Bar Town Chairperson', 'Town Board'],
      ['Foo Alderman - Ward 4', 'Board of Aldermen'],
      ['Foo Alderperson - Ward 4', 'Board of Alderpersons'],
      ['Foo Selectman', 'Board of Selectmen'],
      ['Foo Aldermanic - District 1', 'Board of Aldermen'],
      ['Foo Borough President', 'Borough Council'],
      ['Foo City Clerk', 'City Council'],
      ['Foo Township Trustee', 'Township Board'],
    ])('%s → %s', (input, expected) => {
      expect(extractBodyFromPositionName(input)).toBe(expected)
    })
  })

  describe('Title Case fallback', () => {
    it.each([
      [
        'Vice President of the United States',
        'Vice President of the United States',
      ],
      // Lowercase input that hits no keyword — confirms forced Title Case.
      ['foo bar baz', 'Foo Bar Baz'],
    ])('%s → %s', (input, expected) => {
      expect(extractBodyFromPositionName(input)).toBe(expected)
    })
  })

  describe('Empty input', () => {
    it.each([
      ['', 'Unknown'],
      ['   ', 'Unknown'],
    ])('%s → %s', (input, expected) => {
      expect(extractBodyFromPositionName(input)).toBe(expected)
    })
  })
})
