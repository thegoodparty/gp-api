import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { BraintrustService } from 'src/vendors/braintrust/braintrust.service'
import { GeminiService } from 'src/vendors/google/services/gemini.service'
import { CommunityEventsService } from './communityEvents.service'
import { CommunityEventsPersister } from './communityEvents.persister'
import { CommunityEventsPromptContext } from './communityEvents.prompts'
import { AnalyticsService } from '@/analytics/analytics.service'

const buildCtx = (
  overrides: Partial<CommunityEventsPromptContext> = {},
): CommunityEventsPromptContext => ({
  today: '2026-09-01',
  electionDate: '2026-11-03',
  primaryElectionDate: '2026-06-01',
  state: 'CA',
  city: 'Anytown',
  zip: '90210',
  officeName: 'Anytown City Council',
  officeLevel: 'Local',
  ...overrides,
})

describe('CommunityEventsService', () => {
  let gemini: {
    generateWithSearch: ReturnType<typeof vi.fn>
    generateStructured: ReturnType<typeof vi.fn>
  }
  let braintrust: { tracedNested: ReturnType<typeof vi.fn> }
  let persister: { persist: ReturnType<typeof vi.fn> }
  let service: CommunityEventsService

  beforeEach(() => {
    gemini = {
      generateWithSearch: vi.fn().mockResolvedValue({
        text: 'search results',
        searchQueries: [],
        sources: [],
      }),
      generateStructured: vi.fn(),
    }

    // tracedNested runs the fn directly in tests, ignoring span wrapping.
    braintrust = {
      tracedNested: vi.fn().mockImplementation(async (_name, fn) => fn()),
    }

    persister = {
      persist: vi.fn().mockResolvedValue(undefined),
    }

    service = new CommunityEventsService(
      gemini as unknown as GeminiService,
      braintrust as unknown as BraintrustService,
      persister as unknown as CommunityEventsPersister,
      {
        track: vi.fn().mockResolvedValue(undefined),
      } as unknown as AnalyticsService,
      createMockLogger(),
    )
  })

  it('returns up to 3 events from the structured stage when all in-window', async () => {
    gemini.generateStructured.mockResolvedValue({
      events: [
        {
          title: 'A',
          description: 'why',
          date: '2026-09-15',
          address: '123 Main St, Anytown, CA 90210',
          url: 'https://a.example',
        },
        {
          title: 'B',
          description: 'why',
          date: '2026-10-01',
          address: null,
          url: null,
        },
        {
          title: 'C',
          description: 'why',
          date: '2026-10-20',
          address: '456 Civic Ave, Anytown, CA 90210',
          url: 'https://c.example',
        },
      ],
    })

    const result = await service.generate(42, 99, 7, buildCtx())

    expect(result.events).toHaveLength(3)
    expect(result.events.map((e) => e.title)).toEqual(['A', 'B', 'C'])
    expect(result.events.map((e) => e.address)).toEqual([
      '123 Main St, Anytown, CA 90210',
      null,
      '456 Civic Ave, Anytown, CA 90210',
    ])
    expect(persister.persist).toHaveBeenCalledWith(42, result)
  })

  it('clamps to MAX_EVENTS = 3 when the model overshoots', async () => {
    gemini.generateStructured.mockResolvedValue({
      events: [
        { title: 'A', description: 'd', date: '2026-09-10', url: null },
        { title: 'B', description: 'd', date: '2026-09-15', url: null },
        { title: 'C', description: 'd', date: '2026-09-20', url: null },
        { title: 'D', description: 'd', date: '2026-09-25', url: null },
        { title: 'E', description: 'd', date: '2026-09-30', url: null },
      ],
    })

    const result = await service.generate(42, 99, 7, buildCtx())

    expect(result.events.map((e) => e.title)).toEqual(['A', 'B', 'C'])
  })

  it('drops events before today', async () => {
    gemini.generateStructured.mockResolvedValue({
      events: [
        // before today (2026-09-01)
        { title: 'Past', description: 'd', date: '2026-08-15', url: null },
        { title: 'Future', description: 'd', date: '2026-09-15', url: null },
      ],
    })

    const result = await service.generate(42, 99, 7, buildCtx())

    expect(result.events.map((e) => e.title)).toEqual(['Future'])
  })

  it('drops events after electionDate', async () => {
    gemini.generateStructured.mockResolvedValue({
      events: [
        { title: 'OK', description: 'd', date: '2026-10-20', url: null },
        // after electionDate (2026-11-03)
        {
          title: 'PostElection',
          description: 'd',
          date: '2026-11-15',
          url: null,
        },
      ],
    })

    const result = await service.generate(42, 99, 7, buildCtx())

    expect(result.events.map((e) => e.title)).toEqual(['OK'])
  })

  it('drops events with unparseable dates', async () => {
    gemini.generateStructured.mockResolvedValue({
      events: [
        { title: 'OK', description: 'd', date: '2026-10-20', url: null },
        { title: 'Bad', description: 'd', date: 'not-a-date', url: null },
      ],
    })

    const result = await service.generate(42, 99, 7, buildCtx())

    expect(result.events.map((e) => e.title)).toEqual(['OK'])
  })

  it('returns an empty events array when the model returns no qualifying events', async () => {
    gemini.generateStructured.mockResolvedValue({ events: [] })

    const result = await service.generate(42, 99, 7, buildCtx())

    expect(result.events).toEqual([])
    // Persist still fires — the cache shape must distinguish "generated,
    // found nothing" (ready, empty) from "not yet generated" (no JSON).
    expect(persister.persist).toHaveBeenCalledWith(42, { events: [] })
  })

  it('normalizes optional url and address to null', async () => {
    gemini.generateStructured.mockResolvedValue({
      events: [
        // No url or address keys at all — both should become null on
        // the persisted shape.
        { title: 'A', description: 'd', date: '2026-09-15' },
        // Explicit nulls.
        {
          title: 'B',
          description: 'd',
          date: '2026-09-16',
          url: null,
          address: null,
        },
      ],
    })

    const result = await service.generate(42, 99, 7, buildCtx())

    expect(result.events.map((e) => e.url)).toEqual([null, null])
    expect(result.events.map((e) => e.address)).toEqual([null, null])
  })

  it('passes search results through to the structured stage prompt', async () => {
    gemini.generateWithSearch.mockResolvedValue({
      text: 'EVENTS_FROM_BR',
      searchQueries: [],
      sources: [],
    })
    gemini.generateStructured.mockResolvedValue({ events: [] })

    await service.generate(42, 99, 7, buildCtx())

    const [structuredPrompt] = gemini.generateStructured.mock.calls[0]
    expect(structuredPrompt).toContain('EVENTS_FROM_BR')
  })
})
