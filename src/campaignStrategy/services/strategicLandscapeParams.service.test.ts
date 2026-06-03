import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StrategicLandscapeParamsService } from './strategicLandscapeParams.service'

const GENERAL = 'br-general'
const PRIMARY = 'br-primary'

const generalCtx = {
  candidate_count: 2,
  candidates: [{ full_name: 'Jane Doe' }],
}
const primaryCtx = {
  candidate_count: 3,
  candidates: [{ full_name: 'Jane Doe' }, { full_name: 'Sam Roe' }],
}

const campaign = (details: unknown) =>
  ({
    details,
    user: {
      email: 'rob@example.com',
      firstName: 'Rob',
      lastName: 'Newland',
      name: null,
    },
  }) as never

describe('StrategicLandscapeParamsService', () => {
  let service: StrategicLandscapeParamsService
  let electionApi: { getStrategyContext: ReturnType<typeof vi.fn> }
  let races: { getPrimaryRaceId: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    electionApi = {
      getStrategyContext: vi.fn(async (id: string) =>
        id === PRIMARY ? primaryCtx : generalCtx,
      ),
    }
    races = { getPrimaryRaceId: vi.fn() }
    service = new StrategicLandscapeParamsService(
      electionApi as never,
      races as never,
    )
  })

  it('returns null primary context and the general context when there is no primary race', async () => {
    races.getPrimaryRaceId.mockResolvedValue(null)

    const out = await service.build(campaign({ raceId: GENERAL }), GENERAL)

    expect(out.campaign_primary_strategy_context).toBeNull()
    expect(out.campaign_strategy_context).toBe(generalCtx)
    expect(out.race_id).toBe(GENERAL)
    expect(out.user_email).toBe('rob@example.com')
    expect(out.user_full_name).toBe('Rob Newland')
    // only the general context was fetched (no primary round-trip)
    expect(electionApi.getStrategyContext).toHaveBeenCalledTimes(1)
    expect(electionApi.getStrategyContext).toHaveBeenCalledWith(GENERAL)
  })

  it('folds the primary roster into campaign_primary_strategy_context when a primary race exists', async () => {
    races.getPrimaryRaceId.mockResolvedValue(PRIMARY)

    const out = await service.build(campaign({ raceId: GENERAL }), GENERAL)

    expect(electionApi.getStrategyContext).toHaveBeenCalledWith(PRIMARY)
    expect(out.campaign_primary_strategy_context).toEqual({
      candidate_count: primaryCtx.candidate_count,
      candidates: primaryCtx.candidates,
    })
  })

  it('passes party + otherParty through from campaign.details', async () => {
    races.getPrimaryRaceId.mockResolvedValue(null)

    const out = await service.build(
      campaign({ party: 'Other', otherParty: 'Working Families' }),
      GENERAL,
    )

    expect(out.user_party_affiliation).toBe('Other')
    expect(out.other_party).toBe('Working Families')
  })

  it('falls back to null party when details fail to parse', async () => {
    races.getPrimaryRaceId.mockResolvedValue(null)

    const out = await service.build(campaign('not-an-object'), GENERAL)

    expect(out.user_party_affiliation).toBeNull()
    expect(out.other_party).toBeNull()
  })
})
