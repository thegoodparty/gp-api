import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { BriefingSchema } from '@/chats/briefing-chats/types/briefing.schema'
import type { Artifact } from '@/llm/tools/getArtifacts.tool'
import { BriefingArtifactsProvider } from './briefingArtifactsProvider'

type ParsedBriefing = z.infer<typeof BriefingSchema>

const BRIEFING_ID = 'brief-xyz'

const baseBriefing = (): ParsedBriefing => ({
  version: '1.0',
  generatedAt: '2026-05-01T00:00:00Z',
  generationModel: 'test-model',
  meeting: {
    citySlug: 'springfield',
    cityName: 'Springfield',
    state: 'OR',
    body: 'City Council',
    date: '2026-05-19',
    time: '6:30 PM',
    title: 'Regular Council Meeting',
    readTime: '8 min',
    sourceUrl: 'https://example.com/agenda.pdf',
    sourceType: 'agenda packet',
  },
  executiveSummary: {
    headline: 'Headline',
    subheadline: 'Sub',
    priorityItemCount: 2,
    totalAgendaItems: 5,
  },
  priorityIssues: [],
  fullAgenda: [],
  fullAgendaSummary: 'summary',
  constituentData: {
    available: false,
    voterCount: null,
    topIssues: [],
    ideology: null,
  },
  footer: { preparedBy: 'GP', contactNote: 'contact' },
})

const baseIssue = (
  number: number,
  withDocs: { name: string; url: string }[] | null,
  agendaItemTitle = 'Item',
  category = 'land use',
): ParsedBriefing['priorityIssues'][number] => ({
  number,
  slug: `issue-${number}`,
  agendaItemTitle,
  category,
  card: {
    headline: 'h',
    whatYouNeedToDo: 'w',
    askThisInTheRoom: 'a',
    tryThis: null,
    actionButtons: [],
  },
  ...(withDocs === null
    ? {}
    : {
        detail: {
          whatIsHappening: 'x',
          whatDecision: 'd',
          whyItMatters: 'y',
          recommendation: 'r',
          actionItem: 'ai',
          askThis: 'a',
          tryThis: null,
          whoIsPresenting: null,
          supportingContext: null,
          supportingDocuments: withDocs,
        },
      }),
})

const makeBriefingJson = (
  overrides: (b: ParsedBriefing) => ParsedBriefing,
): string => JSON.stringify(overrides(baseBriefing()))

describe('BriefingArtifactsProvider', () => {
  it('returns source agenda + supporting docs in priorityIssue order', async () => {
    const json = makeBriefingJson((b) => ({
      ...b,
      meeting: { ...b.meeting, title: 'Regular Council Meeting' },
      priorityIssues: [
        baseIssue(
          2,
          [{ name: 'Rate Study Memo', url: 'https://ex.com/rate.pdf' }],
          'Water Rate Study',
          'infrastructure',
        ),
        baseIssue(
          1,
          [{ name: 'STR Staff Memo', url: 'https://ex.com/str.pdf' }],
          'STR Ordinance',
          'land use',
        ),
      ],
    }))
    const provider = new BriefingArtifactsProvider(json, BRIEFING_ID)

    const out = await provider.list()

    const expected: Artifact[] = [
      {
        id: `${BRIEFING_ID}:source`,
        title: 'Regular Council Meeting',
        kind: 'document',
        snippet: 'Source agenda packet for the 2026-05-19 meeting.',
        url: 'https://example.com/agenda.pdf',
      },
      {
        id: `${BRIEFING_ID}:priority-1:0`,
        title: 'STR Staff Memo',
        kind: 'link',
        snippet: 'Supporting document for "STR Ordinance" (land use).',
        url: 'https://ex.com/str.pdf',
      },
      {
        id: `${BRIEFING_ID}:priority-2:0`,
        title: 'Rate Study Memo',
        kind: 'link',
        snippet: 'Supporting document for "Water Rate Study" (infrastructure).',
        url: 'https://ex.com/rate.pdf',
      },
    ]
    expect(out).toEqual(expected)
  })

  it('omits source artifact when meeting.sourceUrl is null', async () => {
    const json = makeBriefingJson((b) => ({
      ...b,
      meeting: { ...b.meeting, sourceUrl: null },
      priorityIssues: [
        baseIssue(1, [{ name: 'Doc A', url: 'https://ex.com/a' }]),
      ],
    }))
    const provider = new BriefingArtifactsProvider(json, BRIEFING_ID)

    const out = await provider.list()

    expect(out).toEqual([
      {
        id: `${BRIEFING_ID}:priority-1:0`,
        title: 'Doc A',
        kind: 'link',
        snippet: 'Supporting document for "Item" (land use).',
        url: 'https://ex.com/a',
      },
    ])
  })

  it('returns only source artifact when priorityIssues is empty', async () => {
    const json = makeBriefingJson((b) => ({ ...b, priorityIssues: [] }))
    const provider = new BriefingArtifactsProvider(json, BRIEFING_ID)

    const out = await provider.list()

    expect(out).toEqual([
      {
        id: `${BRIEFING_ID}:source`,
        title: 'Regular Council Meeting',
        kind: 'document',
        snippet: 'Source agenda packet for the 2026-05-19 meeting.',
        url: 'https://example.com/agenda.pdf',
      },
    ])
  })

  it('skips a priority issue that has no detail', async () => {
    const json = makeBriefingJson((b) => ({
      ...b,
      meeting: { ...b.meeting, sourceUrl: null },
      priorityIssues: [baseIssue(1, null)],
    }))
    const provider = new BriefingArtifactsProvider(json, BRIEFING_ID)

    const out = await provider.list()

    expect(out).toEqual([])
  })

  it('skips a priority issue whose supportingDocuments is empty', async () => {
    const json = makeBriefingJson((b) => ({
      ...b,
      meeting: { ...b.meeting, sourceUrl: null },
      priorityIssues: [baseIssue(1, [])],
    }))
    const provider = new BriefingArtifactsProvider(json, BRIEFING_ID)

    const out = await provider.list()

    expect(out).toEqual([])
  })

  it('returns [] when JSON is malformed', async () => {
    const provider = new BriefingArtifactsProvider(
      '{not valid json',
      BRIEFING_ID,
    )

    const out = await provider.list()

    expect(out).toEqual([])
  })

  it('returns [] when JSON parses but does not match BriefingSchema', async () => {
    const provider = new BriefingArtifactsProvider(
      JSON.stringify({ totally: 'wrong shape' }),
      BRIEFING_ID,
    )

    const out = await provider.list()

    expect(out).toEqual([])
  })

  it('is deterministic — repeated calls return deep-equal output', async () => {
    const json = makeBriefingJson((b) => ({
      ...b,
      priorityIssues: [
        baseIssue(1, [{ name: 'Doc 1', url: 'https://ex.com/1' }]),
        baseIssue(2, [
          { name: 'Doc 2', url: 'https://ex.com/2' },
          { name: 'Doc 3', url: 'https://ex.com/3' },
        ]),
      ],
    }))
    const provider = new BriefingArtifactsProvider(json, BRIEFING_ID)

    const first = await provider.list()
    const second = await provider.list()

    expect(second).toEqual(first)
  })

  it('drops artifacts with non-https URLs (javascript:, file:, http:)', async () => {
    const json = makeBriefingJson((b) => ({
      ...b,
      meeting: { ...b.meeting, sourceUrl: null },
      priorityIssues: [
        baseIssue(1, [
          { name: 'XSS', url: 'javascript:alert(1)' },
          { name: 'Local', url: 'file:///etc/passwd' },
          { name: 'Insecure', url: 'http://ex.com/insecure.pdf' },
          { name: 'Secure', url: 'https://ex.com/ok.pdf' },
        ]),
      ],
    }))
    const provider = new BriefingArtifactsProvider(json, BRIEFING_ID)

    const out = await provider.list()

    expect(out.map((a) => a.url)).toEqual(['https://ex.com/ok.pdf'])
  })

  it('drops the source artifact when meeting.sourceUrl is not https', async () => {
    const json = makeBriefingJson((b) => ({
      ...b,
      meeting: { ...b.meeting, sourceUrl: 'http://ex.com/agenda.pdf' },
      priorityIssues: [],
    }))
    const provider = new BriefingArtifactsProvider(json, BRIEFING_ID)

    const out = await provider.list()

    expect(out).toEqual([])
  })

  it('accepts a pre-parsed briefing via parsed-artifact constructor', async () => {
    const parsed = baseBriefing()
    parsed.priorityIssues = [
      baseIssue(1, [{ name: 'Doc', url: 'https://ex.com/d.pdf' }]),
    ]
    const provider = new BriefingArtifactsProvider(parsed, BRIEFING_ID)

    const out = await provider.list()

    expect(out.map((a) => a.id)).toEqual([
      `${BRIEFING_ID}:source`,
      `${BRIEFING_ID}:priority-1:0`,
    ])
  })

  it('returns [] when constructed with null parsed artifact', async () => {
    const provider = new BriefingArtifactsProvider(null, BRIEFING_ID)

    const out = await provider.list()

    expect(out).toEqual([])
  })

  it('produces artifact ids prefixed with the briefingId', async () => {
    const json = makeBriefingJson((b) => ({
      ...b,
      priorityIssues: [
        baseIssue(1, [
          { name: 'A', url: 'https://ex.com/a' },
          { name: 'B', url: 'https://ex.com/b' },
        ]),
      ],
    }))
    const provider = new BriefingArtifactsProvider(json, 'brief-abc')

    const out = await provider.list()

    expect(out.map((a) => a.id)).toEqual([
      'brief-abc:source',
      'brief-abc:priority-1:0',
      'brief-abc:priority-1:1',
    ])
  })
})
