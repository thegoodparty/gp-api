import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '../services/systemPromptBuilder'
import { HENDERSONVILLE_FIXTURE } from './fixtures/hendersonvilleBriefing.fixture'

describe('briefing chat prompt — integration with Hendersonville fixture', () => {
  const out = buildSystemPrompt(HENDERSONVILLE_FIXTURE)

  it('contains city and state', () => {
    expect(out).toContain('Hendersonville')
    expect(out).toContain('NC')
  })

  it('contains the formatted meeting date', () => {
    expect(out).toContain('May 19, 2026')
  })

  it('contains the meeting time and timezone', () => {
    expect(out).toContain('6:30 PM')
    expect(out).toContain('America/New_York')
  })

  it("contains today's date as provided", () => {
    expect(out).toContain('May 14, 2026')
  })

  it('does not embed the user full name', () => {
    expect(out).not.toContain('Jane Smith')
  })

  it('contains the office title', () => {
    expect(out).toContain('Council Member')
  })

  it('enumerates every available tool name', () => {
    for (const tool of HENDERSONVILLE_FIXTURE.availableToolNames) {
      expect(out).toContain(tool)
    }
  })

  it('wraps the artifact in <briefing> delimiters', () => {
    expect(out).toContain('<briefing>')
    expect(out).toContain('</briefing>')
  })

  it('contains the executive summary text', () => {
    expect(out).toContain(
      'Two contentious items: short-term-rental ordinance and a new ' +
        'water-rate study.',
    )
  })

  it('contains the STR ordinance issue text', () => {
    expect(out).toContain('Amendment to Short-Term Rental Ordinance')
    expect(out).toContain('one per natural person')
    expect(out).toContain('6-month sunset clause')
  })

  it('contains the water rate study issue text', () => {
    expect(out).toContain('Authorize Cost-of-Service Water Rate Study')
    expect(out).toContain('Raftelis')
    expect(out).toContain('$180K')
  })

  it('is deterministic — two calls return identical strings', () => {
    const a = buildSystemPrompt(HENDERSONVILLE_FIXTURE)
    const b = buildSystemPrompt(HENDERSONVILLE_FIXTURE)
    expect(a).toBe(b)
  })
})
