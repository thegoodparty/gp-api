import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'
import {
  CampaignStrategy,
  ExperimentRun,
  ExperimentRunStatus,
} from '@prisma/client'
import { z } from 'zod'
import { CampaignWith } from '@/campaigns/campaigns.types'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { ExperimentRunsService } from '@/agentExperiments/services/experimentRuns.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import {
  parseOpponents,
  parseOpportunitiesAndChallenges,
  StrategicLandscapeResponse,
  StrategicLandscapeResult,
} from '../schemas/strategicLandscape.schema'
import { StrategicLandscapeParamsService } from './strategicLandscapeParams.service'
import { StrategicLandscapePersister } from './strategicLandscape.persister'

const OPPOSITION = 'opposition_research'
const OPPORTUNITIES = 'opportunities_and_challenges'

// Defensive Zod parse over Campaign.details (Prisma JSON). raceId is the
// BallotReady race hash election-api keys on.
const CampaignDetailsSchema = z.object({ raceId: z.string().optional() })

const resolveRaceId = (details: CampaignWith<'user'>['details']): string => {
  const parsed = CampaignDetailsSchema.safeParse(details)
  const raceId = parsed.success ? (parsed.data.raceId ?? '').trim() : ''
  if (raceId.length === 0) {
    throw new BadRequestException(
      'Campaign has no raceId — finish onboarding before generating a strategy.',
    )
  }
  return raceId
}

@Injectable()
export class CampaignStrategyService extends createPrismaBase(
  MODELS.CampaignStrategy,
) {
  constructor(
    private readonly params: StrategicLandscapeParamsService,
    private readonly experimentRuns: ExperimentRunsService,
    private readonly persister: StrategicLandscapePersister,
    private readonly s3: S3Service,
  ) {
    super()
  }

  async getOrGenerateStrategicLandscape(
    campaign: CampaignWith<'user'>,
  ): Promise<StrategicLandscapeResponse> {
    if (!campaign.user) {
      throw new InternalServerErrorException(
        'Campaign has no associated user — check @UseCampaign include',
      )
    }

    // Resolve raceId synchronously so a 400 surfaces to this call rather than
    // a dispatch with no race.
    const brHashId = resolveRaceId(campaign.details)
    const plan = await this.upsertForCampaign(campaign.id)

    const opposition = await this.runFor(plan.oppositionRunId)
    const opportunities = await this.runFor(plan.opportunitiesRunId)

    // A failed run is terminal — never retry, just report it. The client
    // surfaces an error instead of polling forever.
    if (this.isFailed(opposition) || this.isFailed(opportunities)) {
      return { status: 'failed' }
    }

    if (this.isComplete(opposition) && this.isComplete(opportunities)) {
      return {
        status: 'ready',
        data: await this.readStrategicLandscape(plan.id),
      }
    }

    await this.dispatchPending(campaign, plan, brHashId, {
      opposition,
      opportunities,
    })
    return { status: 'generating' }
  }

  // Queue-consumer hook: when one of the two CAP runs completes, load its
  // artifact and persist that section. Each section persists independently;
  // the endpoint reports 'ready' once both runs are COMPLETED.
  async onExperimentRunCompleted(run: ExperimentRun): Promise<void> {
    if (run.status !== ExperimentRunStatus.COMPLETED) return
    if (
      run.experimentType !== OPPOSITION &&
      run.experimentType !== OPPORTUNITIES
    ) {
      return
    }
    if (!run.artifactBucket || !run.artifactKey) return

    const plan = await this.findFirst({
      where:
        run.experimentType === OPPOSITION
          ? { oppositionRunId: run.runId }
          : { opportunitiesRunId: run.runId },
    })
    if (!plan) return

    const raw = await this.s3.getFile(run.artifactBucket, run.artifactKey)
    if (!raw) return

    if (run.experimentType === OPPOSITION) {
      await this.persister.persistOpponents(plan.id, parseOpponents(raw))
      return
    }
    const { opportunities, challenges } = parseOpportunitiesAndChallenges(raw)
    await this.persister.persistOpportunitiesAndChallenges(
      plan.id,
      opportunities,
      challenges,
    )
  }

  private runFor(runId: string | null): Promise<ExperimentRun | null> {
    if (!runId) return Promise.resolve(null)
    return this.experimentRuns.findUnique({ where: { runId } })
  }

  private isComplete(run: ExperimentRun | null): boolean {
    return run?.status === ExperimentRunStatus.COMPLETED
  }

  private isFailed(run: ExperimentRun | null): boolean {
    return run?.status === ExperimentRunStatus.FAILED
  }

  // Only dispatch an experiment that was never started. A failed run is NOT
  // re-dispatched (see getOrGenerateStrategicLandscape) — no retry loop.
  private needsDispatch(run: ExperimentRun | null): boolean {
    return run === null
  }

  private async dispatchPending(
    campaign: CampaignWith<'user'>,
    plan: CampaignStrategy,
    brHashId: string,
    runs: {
      opposition: ExperimentRun | null
      opportunities: ExperimentRun | null
    },
  ): Promise<void> {
    const dispatchOpposition = this.needsDispatch(runs.opposition)
    const dispatchOpportunities = this.needsDispatch(runs.opportunities)
    if (!dispatchOpposition && !dispatchOpportunities) return

    const clerkUserId = campaign.user?.clerkId
    if (!clerkUserId) {
      throw new BadRequestException(
        'User must be signed in to generate a strategy.',
      )
    }

    const params = await this.params.build(campaign, brHashId)
    const base = {
      organizationSlug: campaign.organizationSlug,
      clerkUserId,
      params,
    }

    if (dispatchOpposition) {
      const run = await this.experimentRuns.dispatchRun({
        type: OPPOSITION,
        ...base,
      })
      if (run) {
        await this.client.campaignStrategy.update({
          where: { id: plan.id },
          data: { oppositionRunId: run.runId },
        })
      }
    }

    if (dispatchOpportunities) {
      const run = await this.experimentRuns.dispatchRun({
        type: OPPORTUNITIES,
        ...base,
      })
      if (run) {
        await this.client.campaignStrategy.update({
          where: { id: plan.id },
          data: { opportunitiesRunId: run.runId },
        })
      }
    }
  }

  private upsertForCampaign(campaignId: number): Promise<CampaignStrategy> {
    return this.client.campaignStrategy.upsert({
      where: { campaignId },
      create: { campaignId },
      update: {},
    })
  }

  private async readStrategicLandscape(
    campaignStrategyId: number,
  ): Promise<StrategicLandscapeResult> {
    const plan = await this.client.campaignStrategy.findUnique({
      where: { id: campaignStrategyId },
      include: {
        opportunities: { orderBy: { order: 'asc' } },
        challenges: { orderBy: { order: 'asc' } },
        opponents: true,
      },
    })
    return {
      opportunities: plan?.opportunities.map((o) => o.content) ?? [],
      challenges: plan?.challenges.map((c) => c.content) ?? [],
      opponents:
        plan?.opponents.map((o) => ({
          fullName: o.fullName,
          partyAffiliation: o.partyAffiliation,
          incumbent: o.incumbent,
        })) ?? [],
    }
  }
}
