import { describe, expect, it } from 'vitest'
import {
  DomainPatternContext,
  expandDomainPattern,
  expandDomainPatterns,
  normalizeName,
} from './domainPatterns.util'

describe('normalizeName', () => {
  it("strips apostrophes (handles O'Neill)", () => {
    expect(normalizeName("O'Neill")).toBe('oneill')
  })

  it('lowercases input', () => {
    expect(normalizeName('SMITH')).toBe('smith')
  })

  it('strips spaces and hyphens', () => {
    expect(normalizeName('De-La Cruz')).toBe('delacruz')
  })

  it('preserves digits', () => {
    expect(normalizeName('Smith2nd')).toBe('smith2nd')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeName('')).toBe('')
  })
})

describe('expandDomainPattern', () => {
  const context: DomainPatternContext = {
    firstName: 'Mary',
    lastName: "O'Neill",
    electionDate: new Date('2026-11-03T00:00:00Z'),
  }

  it('substitutes {last_name} with the normalized form', () => {
    expect(expandDomainPattern('{last_name}.run', context)).toEqual([
      'oneill.run',
    ])
  })

  it('substitutes {month_abbreviation} as lowercase 3-letter month', () => {
    expect(expandDomainPattern('x-{month_abbreviation}.run', context)).toEqual([
      'x-nov.run',
    ])
  })

  it('substitutes {yyyy} and {mm}', () => {
    expect(expandDomainPattern('{mm}{yyyy}.run', context)).toEqual([
      '112026.run',
    ])
  })

  it('substitutes {first_initial} and {last_initial} from normalized name', () => {
    expect(
      expandDomainPattern(
        'vote-{first_initial}{last_initial}-{mm}{yyyy}.run',
        context,
      ),
    ).toEqual(['vote-mo-112026.run'])
  })

  it('expands a single TLD alternation', () => {
    expect(expandDomainPattern('vote-{last_name}.(run|bio)', context)).toEqual([
      'vote-oneill.run',
      'vote-oneill.bio',
    ])
  })

  it('expands the cross-product of multiple alternations', () => {
    const result = expandDomainPattern(
      'vote-(4|for)-{last_name}.(run|win)',
      context,
    )
    expect(result.sort()).toEqual(
      [
        'vote-4-oneill.run',
        'vote-4-oneill.win',
        'vote-for-oneill.run',
        'vote-for-oneill.win',
      ].sort(),
    )
  })

  it('expands the full six-TLD × (4|for) cross-product (12 candidates)', () => {
    const result = expandDomainPattern(
      'vote(4|for){last_name}{month_abbreviation}{yyyy}.(run|bio|fyi|win|digital|site)',
      context,
    )
    expect(result).toHaveLength(12)
    expect(result).toContain('vote4oneillnov2026.run')
    expect(result).toContain('voteforoneillnov2026.digital')
  })

  it('returns empty when {last_name} resolves to empty', () => {
    expect(
      expandDomainPattern('{last_name}.run', {
        firstName: 'Mary',
        lastName: '',
        electionDate: new Date('2026-11-03'),
      }),
    ).toEqual([])
  })

  it('returns empty when {first_initial} resolves to empty', () => {
    expect(
      expandDomainPattern('{first_initial}{last_initial}.run', {
        firstName: '',
        lastName: 'Smith',
        electionDate: new Date('2026-11-03'),
      }),
    ).toEqual([])
  })

  it('returns empty when an unknown placeholder is present', () => {
    expect(expandDomainPattern('{wat}.run', context)).toEqual([])
  })

  it('pads single-digit month to two digits in {mm}', () => {
    expect(
      expandDomainPattern('x-{mm}.run', {
        ...context,
        electionDate: new Date('2026-01-15T00:00:00Z'),
      }),
    ).toEqual(['x-01.run'])
  })
})

describe('expandDomainPatterns', () => {
  const context: DomainPatternContext = {
    firstName: 'Mary',
    lastName: "O'Neill",
    electionDate: new Date('2026-11-03T00:00:00Z'),
  }

  it('expands and deduplicates across multiple patterns', () => {
    const result = expandDomainPatterns(
      [
        'vote-{last_name}.run',
        'vote-{last_name}.run',
        'vote-{last_name}.(run|bio)',
      ],
      context,
    )
    expect(result.sort()).toEqual(['vote-oneill.bio', 'vote-oneill.run'])
  })

  it('returns empty array for empty input', () => {
    expect(expandDomainPatterns([], context)).toEqual([])
  })
})
