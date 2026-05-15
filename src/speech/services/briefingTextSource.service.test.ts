import { ElectedOffice, Organization, User } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { MeetingBriefingResponse } from '@goodparty_org/contracts'
import { MeetingBriefingsService } from '@/meetings/services/meetingBriefings.service'
import { BriefingTextSource } from './briefingTextSource.service'

const MEETING_DATE = '2026-05-14'
const EXPECTED_DATE_AT_MIDNIGHT_UTC = new Date(`${MEETING_DATE}T00:00:00Z`)

const buildBriefing = (
  overrides: Partial<MeetingBriefingResponse> = {},
): MeetingBriefingResponse => ({
  id: 'b1',
  slug: 'springfield-city-council-2026-05-14',
  meeting_id: 'm1',
  title: 'Springfield City Council Meeting',
  meeting_date: 'May 14, 2026',
  status: 'briefing_ready',
  reading_time_minutes: 5,
  generated_at: '2026-05-01T12:00:00Z',
  meeting: {
    id: 'm1',
    name: 'City Council',
    body: 'City Council',
    type: 'city_council',
    scheduled_at: '2026-05-14T18:00:00-05:00',
    location: 'Council Chambers',
  },
  executive_summary: 'Three priority items tonight including the budget vote.',
  agenda: [],
  action_items: [
    {
      id: 'a1',
      title: 'Budget Amendment',
      overview: 'A vote on Amendment 4 to the **city budget**.',
      constituent_sentiment: {
        summary: 'Constituents support the parks carve-out.',
        detail: 'Detailed sentiment analysis...',
        sources: ['poll-1'],
      },
      recent_news: [],
      budget_impact: {
        summary: 'Net neutral over five years.',
        sources: [],
      },
      talking_points: [
        'Approve with the parks carve-out.',
        'See [memo](https://example.org/memo).',
      ],
      sources: [],
    },
  ],
  ...overrides,
})

const buildSource = (briefing: MeetingBriefingResponse | null) => {
  const meetingBriefings = {
    loadBriefingArtifact: vi.fn().mockResolvedValue(briefing),
  } as unknown as MeetingBriefingsService
  return {
    source: new BriefingTextSource(meetingBriefings),
    meetingBriefings,
  }
}

const inputArgs = (id = MEETING_DATE) => ({
  id,
  user: { id: 1 } as User,
  organization: { slug: 'springfield' } as Organization,
  electedOffice: { id: 'eo-uuid-42' } as ElectedOffice,
})

describe('BriefingTextSource', () => {
  it('looks up the briefing using electedOfficeId and the date as midnight UTC', async () => {
    const briefing = buildBriefing()
    const { source, meetingBriefings } = buildSource(briefing)
    const args = inputArgs(MEETING_DATE)

    await source.loadText(args)

    expect(meetingBriefings.loadBriefingArtifact).toHaveBeenCalledWith(
      'eo-uuid-42',
      EXPECTED_DATE_AT_MIDNIGHT_UTC,
    )
  })

  it('throws NotFoundException when the briefing artifact is missing', async () => {
    const { source } = buildSource(null)

    await expect(source.loadText(inputArgs())).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('builds a cache key from slug and generated_at so regenerations bust the cache', async () => {
    const briefing = buildBriefing()
    const { source } = buildSource(briefing)

    const result = await source.loadText(inputArgs())

    expect(result.cacheKey).toBe(
      'springfield-city-council-2026-05-14:2026-05-01T12:00:00Z',
    )
  })

  it('renders title and executive_summary as the opening sections', async () => {
    const briefing = buildBriefing()
    const { source } = buildSource(briefing)

    const { text } = await source.loadText(inputArgs())

    expect(text.startsWith('Springfield City Council Meeting')).toBe(true)
    expect(text).toContain(
      'Three priority items tonight including the budget vote.',
    )
  })

  it('renders action items with overview, sentiment, budget impact, and talking points', async () => {
    const briefing = buildBriefing()
    const { source } = buildSource(briefing)

    const { text } = await source.loadText(inputArgs())

    expect(text).toContain('Action item: Budget Amendment.')
    expect(text).toContain('A vote on Amendment 4')
    expect(text).toContain(
      'Constituent sentiment: Constituents support the parks carve-out.',
    )
    expect(text).toContain('Budget impact: Net neutral over five years.')
    expect(text).toContain('Talking points.')
    expect(text).toContain('Approve with the parks carve-out.')
  })

  it('strips markdown markers and link syntax from the text', async () => {
    const briefing = buildBriefing()
    const { source } = buildSource(briefing)

    const { text } = await source.loadText(inputArgs())

    expect(text).not.toMatch(/\*\*/)
    expect(text).not.toMatch(/\]\(http/)
    expect(text).toContain('A vote on Amendment 4 to the city budget.')
    expect(text).toContain('See memo.')
  })

  it('omits optional sentiment, budget impact, and talking points when absent', async () => {
    const briefing = buildBriefing({
      action_items: [
        {
          id: 'a1',
          title: 'Simple Item',
          overview: 'Just an overview.',
          recent_news: [],
          talking_points: [],
          sources: [],
        },
      ],
    })
    const { source } = buildSource(briefing)

    const { text } = await source.loadText(inputArgs())

    expect(text).toContain('Action item: Simple Item.')
    expect(text).toContain('Just an overview.')
    expect(text).not.toContain('Constituent sentiment:')
    expect(text).not.toContain('Budget impact:')
    expect(text).not.toContain('Talking points.')
  })

  it('omits the executive summary section when the field is empty', async () => {
    const briefing = buildBriefing({ executive_summary: '' })
    const { source } = buildSource(briefing)

    const { text } = await source.loadText(inputArgs())

    expect(text.startsWith('Springfield City Council Meeting')).toBe(true)
    expect(text).not.toContain(
      'Three priority items tonight including the budget vote.',
    )
  })
})
