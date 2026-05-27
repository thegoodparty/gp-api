import { describe, expect, it } from 'vitest'
import {
  buildPromptVariables,
  OPPORTUNITIES_SEARCH_PROMPT,
  renderPrompt,
} from './strategicLandscape.prompts'
import { RaceContext } from '../types/electionApi.types'

const NOT_AVAILABLE = 'not available'

const baseCtx: RaceContext = {
  userFullName: 'Jane Doe',
  userPartyAffiliation: 'Independent',
  state: 'CA',
  candidateOffice: 'City Council',
  officialOfficeName: 'Anytown City Council',
  officeLevel: 'Local',
  officeType: 'Council',
  primaryElectionDate: '2026-06-01',
  generalElectionDate: '2026-11-01',
  relevantElectionDate: '2026-06-01',
  numberOfSeats: 1,
  projectedTurnout: 1000,
  civicsWinNumber: null,
  winNumberEstimate: 501,
  winNumberEffective: 501,
  contactsNeededEstimate: 2505,
  candidateCount: 3,
  candidates: [
    {
      gpCandidateId: 'a',
      firstName: 'Jane',
      lastName: 'Doe',
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      websiteUrl: null,
      party: 'Independent',
      isIncumbent: null,
      isUser: true,
    },
    {
      gpCandidateId: 'b',
      firstName: 'Bob',
      lastName: 'Smith',
      fullName: 'Bob Smith',
      email: 'bob@example.com',
      websiteUrl: 'https://bobsmith.example',
      party: 'Nonpartisan',
      isIncumbent: true,
      isUser: false,
    },
    {
      gpCandidateId: 'c',
      firstName: 'Alice',
      lastName: 'Jones',
      fullName: 'Alice Jones',
      email: null,
      websiteUrl: null,
      party: 'Green',
      isIncumbent: null,
      isUser: false,
    },
  ],
}

describe('buildPromptVariables', () => {
  it('flattens RaceContext into snake_case keys', () => {
    const vars = buildPromptVariables(baseCtx, new Date('2026-05-17T12:00:00'))

    expect(vars.user_full_name).toBe('Jane Doe')
    expect(vars.today).toBe('2026-05-17')
    expect(vars.candidate_office).toBe('City Council')
    expect(vars.win_number_estimate).toBe('501')
  })

  it('serializes candidates as JSON including the user', () => {
    const vars = buildPromptVariables(baseCtx)
    const parsed = JSON.parse(vars.candidates) as Array<{
      fullName: string
      isUser: boolean
      isIncumbent?: boolean
      websiteUrl?: string
    }>

    expect(parsed).toHaveLength(3)

    const jane = parsed.find((c) => c.fullName === 'Jane Doe')
    expect(jane).toBeDefined()
    expect(jane?.isUser).toBe(true)

    const bob = parsed.find((c) => c.fullName === 'Bob Smith')
    expect(bob).toBeDefined()
    expect(bob?.isIncumbent).toBe(true)
    expect(bob?.websiteUrl).toBe('https://bobsmith.example')
  })

  it('uses "not available" sentinel for missing string fields', () => {
    const vars = buildPromptVariables({
      ...baseCtx,
      officeLevel: null,
      officeType: null,
    })

    expect(vars.office_level).toBe(NOT_AVAILABLE)
    expect(vars.office_type).toBe(NOT_AVAILABLE)
  })

  it('renders "not available" for null numeric scalars instead of "null"', () => {
    const vars = buildPromptVariables({
      ...baseCtx,
      numberOfSeats: null,
      projectedTurnout: null,
      winNumberEstimate: null,
      winNumberEffective: null,
      contactsNeededEstimate: null,
    })

    expect(vars.number_of_seats).toBe(NOT_AVAILABLE)
    expect(vars.projected_turnout).toBe(NOT_AVAILABLE)
    expect(vars.win_number_estimate).toBe(NOT_AVAILABLE)
    expect(vars.contacts_needed_estimate).toBe(NOT_AVAILABLE)
  })

  it('renders every race scalar as "not available" when the API returns all nulls', () => {
    const allNull: RaceContext = {
      userFullName: 'Jane Doe',
      userPartyAffiliation: 'Independent',
      state: null,
      candidateOffice: null,
      officialOfficeName: null,
      officeLevel: null,
      officeType: null,
      primaryElectionDate: null,
      generalElectionDate: null,
      relevantElectionDate: null,
      numberOfSeats: null,
      projectedTurnout: null,
      civicsWinNumber: null,
      winNumberEstimate: null,
      winNumberEffective: null,
      contactsNeededEstimate: null,
      candidateCount: 0,
      candidates: [],
    }

    const vars = buildPromptVariables(allNull)
    const rendered = renderPrompt(OPPORTUNITIES_SEARCH_PROMPT, vars)

    expect(rendered).not.toMatch(/\bnull\b/)
    expect(rendered).toContain('not available')
    expect(rendered).not.toMatch(/\{\{[a-zA-Z]/)
  })

  it('caps candidate fullName, party, and websiteUrl to bound prompt-injection payload size', () => {
    const longString = 'A'.repeat(2000)
    const vars = buildPromptVariables({
      ...baseCtx,
      candidates: [
        {
          gpCandidateId: 'x',
          firstName: 'X',
          lastName: 'Y',
          fullName: longString,
          email: null,
          websiteUrl: longString,
          party: longString,
          isIncumbent: null,
          isUser: false,
        },
      ],
    })

    const parsed = JSON.parse(vars.candidates) as Array<{
      fullName: string
      party?: string
      websiteUrl?: string
    }>

    expect(parsed[0].fullName.length).toBeLessThanOrEqual(200)
    expect(parsed[0].party?.length ?? 0).toBeLessThanOrEqual(100)
    expect(parsed[0].websiteUrl?.length ?? 0).toBeLessThanOrEqual(500)
  })

  it('omits null party and websiteUrl from candidate JSON; keeps isIncumbent tri-state', () => {
    const vars = buildPromptVariables({
      ...baseCtx,
      candidates: [
        {
          gpCandidateId: null,
          firstName: 'No',
          lastName: 'Party',
          fullName: 'No Party',
          email: null,
          websiteUrl: null,
          party: null,
          isIncumbent: null,
          isUser: false,
        },
      ],
    })

    const parsed = JSON.parse(vars.candidates) as Array<Record<string, unknown>>
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).not.toHaveProperty('party')
    expect(parsed[0]).not.toHaveProperty('websiteUrl')
    expect(parsed[0].isIncumbent).toBeNull()
    expect(parsed[0].fullName).toBe('No Party')
    expect(parsed[0].isUser).toBe(false)
  })
})

describe('renderPrompt', () => {
  it('substitutes {{var}} placeholders', () => {
    const result = renderPrompt('Hello {{name}}, you live in {{state}}.', {
      name: 'Jane',
      state: 'CA',
    })

    expect(result).toBe('Hello Jane, you live in CA.')
  })

  it('HTML-escapes values so untrusted input cannot break out of XML-style tags', () => {
    const result = renderPrompt('Office: <office>{{office}}</office>', {
      office: 'Mayor</office><script>alert(1)</script>',
    })

    expect(result).toContain('&lt;/office&gt;')
    expect(result).toContain('&lt;script&gt;')
    expect(result).not.toContain('</office><script>')
  })

  it('leaves untemplated placeholders alone', () => {
    const result = renderPrompt('{{a}} and {{b}}', { a: 'x' })

    expect(result).toBe('x and {{b}}')
  })
})

describe('OPPORTUNITIES_SEARCH_PROMPT rendering', () => {
  it('produces a complete prompt with all variables substituted', () => {
    const vars = buildPromptVariables(baseCtx, new Date('2026-05-17T12:00:00'))
    const rendered = renderPrompt(OPPORTUNITIES_SEARCH_PROMPT, vars)

    expect(rendered).toContain('Jane Doe')
    expect(rendered).toContain('City Council')
    expect(rendered).toContain('CA')
    expect(rendered).not.toMatch(/\{\{[a-zA-Z]/)
  })
})
