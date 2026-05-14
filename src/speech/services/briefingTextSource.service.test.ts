import { Organization, User } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { Briefing } from '@/meetings/types/briefing.types'
import { MeetingsService } from '@/meetings/services/meetings.service'
import { BriefingTextSource } from './briefingTextSource.service'

const MEETING_DATE = '2026-05-14'

const buildBriefing = (overrides: Partial<Briefing> = {}): Briefing => ({
  version: '1',
  generatedAt: '2026-05-01T12:00:00Z',
  generationModel: 'gpt-test',
  meeting: {
    citySlug: 'springfield-mo',
    cityName: 'Springfield',
    state: 'MO',
    body: 'City Council',
    date: MEETING_DATE,
    time: '6:00 PM',
    title: 'Springfield City Council Meeting',
    readTime: '5 min',
    sourceUrl: null,
    sourceType: 'agenda',
  },
  executiveSummary: {
    headline: 'Three priority items tonight.',
    subheadline: 'Budget vote, zoning hearing, parks contract.',
    priorityItemCount: 1,
    totalAgendaItems: 5,
  },
  priorityIssues: [
    {
      number: 1,
      slug: 'budget-vote',
      agendaItemTitle: 'Budget Amendment',
      category: 'finance',
      card: {
        headline: 'Vote on the **budget amendment** tonight.',
        whatYouNeedToDo: 'Read the proposed amendment before the meeting.',
        askThisInTheRoom: 'How does this affect the parks budget?',
        tryThis: null,
        actionButtons: [],
      },
      detail: {
        whatIsHappening: 'A vote on Amendment 4.',
        whatDecision: 'Approve or reject the amendment.',
        whyItMatters: 'It changes the parks line item.',
        recommendation: 'Approve with the parks carve-out.',
        actionItem: 'Bring the budget memo.',
        askThis: 'Will parks funding be preserved?',
        tryThis: null,
        whoIsPresenting: 'Finance Director',
        supportingContext: 'See [memo](https://example.org/memo).',
        supportingDocuments: [],
      },
    },
  ],
  fullAgenda: [],
  fullAgendaSummary:
    'Five items including the budget vote and a zoning hearing.',
  constituentData: {
    available: false,
    voterCount: null,
    topIssues: [],
    ideology: null,
  },
  footer: {
    preparedBy: 'Test',
    contactNote: 'Contact us',
  },
  ...overrides,
})

const buildSource = (briefing: Briefing) => {
  const meetingsService = {
    getBriefing: vi.fn().mockResolvedValue(briefing),
  } as unknown as MeetingsService
  return { source: new BriefingTextSource(meetingsService), meetingsService }
}

const inputArgs = (id = MEETING_DATE) => ({
  id,
  user: { id: 1 } as User,
  organization: { slug: 'springfield' } as Organization,
})

describe('BriefingTextSource', () => {
  it('looks up the briefing using the supplied organization and date id', async () => {
    const briefing = buildBriefing()
    const { source, meetingsService } = buildSource(briefing)
    const args = inputArgs(MEETING_DATE)

    await source.loadText(args)

    expect(meetingsService.getBriefing).toHaveBeenCalledWith(
      args.organization,
      MEETING_DATE,
    )
  })

  it('builds a cache key from citySlug, date, and generatedAt', async () => {
    const briefing = buildBriefing()
    const { source } = buildSource(briefing)

    const result = await source.loadText(inputArgs())

    expect(result.cacheKey).toBe(
      `springfield-mo:${MEETING_DATE}:2026-05-01T12:00:00Z`,
    )
  })

  it('renders the meeting title, headline, and subheadline as the opening sections', async () => {
    const briefing = buildBriefing()
    const { source } = buildSource(briefing)

    const { text } = await source.loadText(inputArgs())

    expect(text.startsWith('Springfield City Council Meeting')).toBe(true)
    expect(text).toContain('Three priority items tonight.')
    expect(text).toContain('Budget vote, zoning hearing, parks contract.')
  })

  it('renders priority issues with their guidance and analysis text', async () => {
    const briefing = buildBriefing()
    const { source } = buildSource(briefing)

    const { text } = await source.loadText(inputArgs())

    expect(text).toContain('Priority item 1. Budget Amendment.')
    expect(text).toContain('Read the proposed amendment before the meeting.')
    expect(text).toContain('A vote on Amendment 4.')
    expect(text).toContain('Approve with the parks carve-out.')
  })

  it('strips markdown markers and link syntax from the text', async () => {
    const briefing = buildBriefing()
    const { source } = buildSource(briefing)

    const { text } = await source.loadText(inputArgs())

    expect(text).not.toMatch(/\*\*/)
    expect(text).not.toMatch(/\]\(http/)
    expect(text).toContain('Vote on the budget amendment tonight.')
    expect(text).toContain('See memo.')
  })

  it('appends the full agenda summary at the end', async () => {
    const briefing = buildBriefing()
    const { source } = buildSource(briefing)

    const { text } = await source.loadText(inputArgs())

    expect(text).toContain('Full agenda summary.')
    expect(
      text.endsWith(
        'Five items including the budget vote and a zoning hearing.',
      ),
    ).toBe(true)
  })

  it('renders only the guidance text when a priority issue has no detail', async () => {
    const briefing = buildBriefing({
      priorityIssues: [
        {
          number: 1,
          slug: 'simple',
          agendaItemTitle: 'Simple Item',
          category: 'misc',
          card: {
            headline: 'Headline only.',
            whatYouNeedToDo: 'Do this.',
            askThisInTheRoom: 'Ask that?',
            tryThis: null,
            actionButtons: [],
          },
        },
      ],
    })
    const { source } = buildSource(briefing)

    const { text } = await source.loadText(inputArgs())

    expect(text).toContain('Priority item 1. Simple Item.')
    expect(text).toContain('Headline only.')
    expect(text).toContain('Do this.')
    expect(text).toContain('Ask that?')
  })

  it('omits the agenda summary section when the field is empty', async () => {
    const briefing = buildBriefing({ fullAgendaSummary: '' })
    const { source } = buildSource(briefing)

    const { text } = await source.loadText(inputArgs())

    expect(text).not.toContain('Full agenda summary.')
  })
})
