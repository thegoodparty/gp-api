import { Injectable } from '@nestjs/common'
import { Campaign, CampaignPlan, User } from '@prisma/client'
import { CampaignWith } from '@/campaigns/campaigns.types'
import { InternalServerErrorException } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { isUniqueConstraintError } from 'src/prisma/util/prismaErrors.util'
import { getUserFullName } from '@/users/util/users.util'
import { StrategicLandscapeResult } from '../schemas/strategicLandscape.schema'
import {
  ApiCandidate,
  RaceCandidate,
  RaceContext,
} from '../types/electionApi.types'
import { ElectionApiMockService } from './electionApiMock.service'
import { StrategicLandscapeService } from './strategicLandscape.service'

const resolvePartyAffiliation = (details: Campaign['details']): string => {
  const party = typeof details?.party === 'string' ? details.party : ''
  if (party === 'Other') {
    return typeof details?.otherParty === 'string' && details.otherParty
      ? details.otherParty
      : party
  }
  return party
}

const normalize = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

// election-api doesn't return an is_user flag — we stitch it here by
// matching the requesting user against the candidate list. Email is the
// primary key (case-insensitive, trimmed). When email is missing on
// either side, fall back to full_name match so a candidate with no email
// can still be identified.
const stitchIsUser = (
  candidates: ApiCandidate[],
  user: User,
): RaceCandidate[] => {
  const userEmail = normalize(user.email)
  const userName = normalize(getUserFullName(user))
  return candidates.map((c) => {
    const candidateEmail = normalize(c.email)
    const candidateName = normalize(c.fullName)
    const emailMatches =
      userEmail.length > 0 &&
      candidateEmail.length > 0 &&
      candidateEmail === userEmail
    const nameMatches =
      (userEmail.length === 0 || candidateEmail.length === 0) &&
      userName.length > 0 &&
      candidateName === userName
    return { ...c, isUser: emailMatches || nameMatches }
  })
}

@Injectable()
export class CampaignPlanService extends createPrismaBase(MODELS.CampaignPlan) {
  constructor(
    private readonly strategicLandscape: StrategicLandscapeService,
    private readonly electionApi: ElectionApiMockService,
  ) {
    super()
  }

  async getOrGenerateStrategicLandscape(
    campaign: CampaignWith<'user'>,
  ): Promise<StrategicLandscapeResult> {
    if (!campaign.user) {
      throw new InternalServerErrorException(
        'Campaign has no associated user — check @UseCampaign include',
      )
    }
    const plan = await this.upsertForCampaign(campaign.id)

    const cached = await this.readStrategicLandscape(plan.id)
    if (cached) return cached

    const ctx = this.buildRaceContext(campaign)
    try {
      return await this.strategicLandscape.generate(plan.id, campaign.id, ctx)
    } catch (error) {
      // If two concurrent requests both miss the cache, the second one trips
      // the @@unique([campaignPlanId, order]) on CampaignPlanOpportunity at
      // persist time. Treat that as "someone else just wrote it" and return
      // their result instead of surfacing the error.
      if (isUniqueConstraintError(error)) {
        const winner = await this.readStrategicLandscape(plan.id)
        if (winner) return winner
      }
      throw error
    }
  }

  private buildRaceContext(campaign: CampaignWith<'user'>): RaceContext {
    const fromApi = this.electionApi.getRaceContext(campaign.id)
    return {
      ...fromApi,
      candidates: campaign.user
        ? stitchIsUser(fromApi.candidates, campaign.user)
        : fromApi.candidates.map((c) => ({ ...c, isUser: false })),
      userFullName: campaign.user ? getUserFullName(campaign.user) : '',
      userPartyAffiliation: resolvePartyAffiliation(campaign.details),
    }
  }

  private upsertForCampaign(campaignId: number): Promise<CampaignPlan> {
    return this.client.campaignPlan.upsert({
      where: { campaignId },
      create: { campaignId },
      update: {},
    })
  }

  private async readStrategicLandscape(
    campaignPlanId: number,
  ): Promise<StrategicLandscapeResult | null> {
    const plan = await this.client.campaignPlan.findUnique({
      where: { id: campaignPlanId },
      include: {
        opportunities: { orderBy: { order: 'asc' } },
        challenges: { orderBy: { order: 'asc' } },
        opponents: {
          include: {
            keyFacts: { orderBy: { order: 'asc' } },
            websites: true,
          },
        },
      },
    })

    if (!plan) return null
    // A generation is considered cached if ANY of the three section tables
    // has at least one row. Guarding on opportunities alone would mis-treat a
    // pathological LLM run that produced empty opportunities but populated
    // challenges/opponents as "never generated", causing infinite re-runs
    // and unbounded duplicate child rows.
    const hasAnySectionContent =
      plan.opportunities.length > 0 ||
      plan.challenges.length > 0 ||
      plan.opponents.length > 0
    if (!hasAnySectionContent) return null

    return {
      opportunities: plan.opportunities.map((o) => o.content),
      challenges: plan.challenges.map((c) => c.content),
      opponents: plan.opponents.map((opp) => ({
        fullName: opp.fullName,
        partyAffiliation: opp.partyAffiliation,
        incumbent: opp.incumbent,
        politicalSummary: opp.politicalSummary,
        keyFacts: opp.keyFacts.map((kf) => kf.content),
        websites: opp.websites.map((w) => w.url),
      })),
    }
  }
}
