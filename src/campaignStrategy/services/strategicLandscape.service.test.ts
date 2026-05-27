import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StrategicLandscapeService } from './strategicLandscape.service'
import { BraintrustService } from 'src/vendors/braintrust/braintrust.service'
import { GeminiService } from 'src/vendors/google/services/gemini.service'
import { StrategicLandscapePersister } from './strategicLandscape.persister'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { RaceContext } from '../types/electionApi.types'

const buildCtx = (): RaceContext => ({
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
  candidateCount: 1,
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
  ],
})

describe('StrategicLandscapeService', () => {
  let gemini: {
    generateWithSearch: ReturnType<typeof vi.fn>
    generateStructured: ReturnType<typeof vi.fn>
  }
  let braintrust: { tracedNested: ReturnType<typeof vi.fn> }
  let persister: { persist: ReturnType<typeof vi.fn> }
  let service: StrategicLandscapeService

  beforeEach(() => {
    gemini = {
      generateWithSearch: vi.fn().mockResolvedValue({
        text: 'search results',
        searchQueries: [],
        sources: [],
      }),
      generateStructured: vi.fn(),
    }

    // tracedNested in tests just runs the fn directly, ignoring tracing wrapping.
    braintrust = {
      tracedNested: vi.fn().mockImplementation(async (_name, fn) => fn()),
    }

    persister = {
      persist: vi.fn().mockResolvedValue(undefined),
    }

    service = new StrategicLandscapeService(
      gemini as unknown as GeminiService,
      braintrust as unknown as BraintrustService,
      persister as unknown as StrategicLandscapePersister,
      createMockLogger(),
    )
  })

  it('runs all 3 pipelines and assembles the combined result', async () => {
    gemini.generateStructured
      .mockResolvedValueOnce({ opportunities: ['o1', 'o2', 'o3'] })
      .mockResolvedValueOnce({ challenges: ['c1', 'c2', 'c3'] })
      .mockResolvedValueOnce({
        opponents: [
          {
            full_name: 'Bob',
            party_affiliation: 'Nonpartisan',
            incumbent: true,
            political_summary: 'background',
            key_facts: ['fact a'],
            websites: ['https://bob.example'],
          },
        ],
      })

    const result = await service.generate(42, 99, buildCtx())

    expect(result.opportunities).toEqual(['o1', 'o2', 'o3'])
    expect(result.challenges).toEqual(['c1', 'c2', 'c3'])
    expect(result.opponents).toEqual([
      {
        fullName: 'Bob',
        partyAffiliation: 'Nonpartisan',
        incumbent: true,
        politicalSummary: 'background',
        keyFacts: ['fact a'],
        websites: ['https://bob.example'],
      },
    ])
  })

  it('defaults opponent optional fields when the LLM omits them', async () => {
    gemini.generateStructured
      .mockResolvedValueOnce({ opportunities: ['o1', 'o2', 'o3'] })
      .mockResolvedValueOnce({ challenges: ['c1', 'c2', 'c3'] })
      .mockResolvedValueOnce({
        opponents: [
          {
            full_name: 'Sparse',
            party_affiliation: 'Unknown',
            incumbent: null,
          },
        ],
      })

    const result = await service.generate(42, 99, buildCtx())

    expect(result.opponents[0]).toEqual({
      fullName: 'Sparse',
      partyAffiliation: 'Unknown',
      incumbent: null,
      politicalSummary: '',
      keyFacts: [],
      websites: [],
    })
  })

  it('persists the assembled result', async () => {
    gemini.generateStructured
      .mockResolvedValueOnce({ opportunities: ['a', 'b', 'c'] })
      .mockResolvedValueOnce({ challenges: ['x', 'y', 'z'] })
      .mockResolvedValueOnce({ opponents: [] })

    await service.generate(42, 99, buildCtx())

    expect(persister.persist).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        opportunities: ['a', 'b', 'c'],
        challenges: ['x', 'y', 'z'],
        opponents: [],
      }),
    )
  })

  it('does not persist when a pipeline throws', async () => {
    gemini.generateStructured
      .mockRejectedValueOnce(new Error('opportunities failed'))
      .mockResolvedValueOnce({ challenges: ['a', 'b', 'c'] })
      .mockResolvedValueOnce({ opponents: [] })

    await expect(service.generate(1, 1, buildCtx())).rejects.toThrow(
      'opportunities failed',
    )
    expect(persister.persist).not.toHaveBeenCalled()
  })

  // Smoke check that the tracing wrapper is still around the generate path.
  // Without this, a refactor could silently drop the Braintrust instrumentation
  // and observability would disappear without breaking any user-facing behavior.
  it('opens a tracedNested span around the generation', async () => {
    gemini.generateStructured
      .mockResolvedValueOnce({ opportunities: ['a', 'b', 'c'] })
      .mockResolvedValueOnce({ challenges: ['a', 'b', 'c'] })
      .mockResolvedValueOnce({ opponents: [] })

    await service.generate(42, 99, buildCtx())

    expect(braintrust.tracedNested).toHaveBeenCalledWith(
      'strategic-landscape:generate',
      expect.any(Function),
      expect.objectContaining({ type: 'task' }),
    )
  })
})
