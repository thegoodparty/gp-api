import { Injectable } from '@nestjs/common'
import { Campaign } from '../../generated/prisma'
import { z } from 'zod'
import { CampaignWith } from '@/campaigns/campaigns.types'
import { getUserFullName } from '@/users/util/users.util'
import { RacesService } from '@/elections/services/races.service'
import { AgentJobContracts } from '@/generated/agent-job-contracts'
import { ElectionApiService } from './electionApi.service'

// Both CAP experiments share one input contract.
type StrategicLandscapeInput = AgentJobContracts['opposition_research']['Input']
type PrimaryContext =
  StrategicLandscapeInput['campaign_primary_strategy_context']

const PartySchema = z
  .object({ party: z.string().optional(), otherParty: z.string().optional() })
  .partial()

// Send the raw party label + otherParty separately; the experiment treats
// 'Other' as a pointer to other_party. Don't collapse them here.
const resolveParty = (
  details: Campaign['details'],
): { party: string | null; otherParty: string | null } => {
  const parsed = PartySchema.safeParse(details)
  if (!parsed.success) return { party: null, otherParty: null }
  return {
    party: parsed.data.party ?? null,
    otherParty: parsed.data.otherParty ?? null,
  }
}

@Injectable()
export class StrategicLandscapeParamsService {
  constructor(
    private readonly electionApi: ElectionApiService,
    private readonly races: RacesService,
  ) {}

  async build(
    campaign: CampaignWith<'user'>,
    brHashId: string,
  ): Promise<StrategicLandscapeInput> {
    const [context, primary] = await Promise.all([
      this.electionApi.getStrategyContext(brHashId),
      this.buildPrimaryContext(brHashId),
    ])
    const { user } = campaign
    const { party, otherParty } = resolveParty(campaign.details)
    return {
      race_id: brHashId,
      user_email: user?.email ?? '',
      user_first_name: user?.firstName ?? null,
      user_last_name: user?.lastName ?? null,
      user_full_name: user ? getUserFullName(user) : '',
      user_party_affiliation: party,
      other_party: otherParty,
      campaign_strategy_context: context,
      campaign_primary_strategy_context: primary,
    }
  }

  private async buildPrimaryContext(brHashId: string): Promise<PrimaryContext> {
    const primaryRaceId = await this.races.getPrimaryRaceId(brHashId)
    if (!primaryRaceId) return null
    const ctx = await this.electionApi.getStrategyContext(primaryRaceId)
    return { candidate_count: ctx.candidate_count, candidates: ctx.candidates }
  }
}
