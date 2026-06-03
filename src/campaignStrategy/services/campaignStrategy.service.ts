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
import { isBefore, subMinutes } from 'date-fns'
import { CampaignWith } from '@/campaigns/campaigns.types'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { ExperimentRunsService } from '@/agentExperiments/services/experimentRuns.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { AgentJobContracts } from '@/generated/agent-job-contracts'
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

// A run that's COMPLETED but whose section never persisted past this window is
// treated as failed. Recovers a stuck run if persistence AND the markFailed
// fallback both fail (a double DB fault) — otherwise it would poll 'generating'
// forever.
const PERSIST_GRACE_MINUTES = 5

// Both CAP experiments share one input contract.
type StrategicLandscapeParams =
  AgentJobContracts['opposition_research']['Input']

// Defensive Zod parse over Campaign.details (Prisma JSON). raceId is the
// BallotReady race hash election-api keys on.
const CampaignDetailsSchema = z.object({ raceId: z.string().optional() })

// BallotReady brHashId is a base64(url) string. Allowlist its charset and
// bound the length before it flows into the election-api body and the
// BallotReady GraphQL hop, so a stray quote/character can't break out.
const RACE_ID_PATTERN = /^[A-Za-z0-9+/=_-]{1,256}$/

const resolveRaceId = (details: CampaignWith<'user'>['details']): string => {
  const parsed = CampaignDetailsSchema.safeParse(details)
  const raceId = parsed.success ? (parsed.data.raceId ?? '').trim() : ''
  if (raceId.length === 0) {
    throw new BadRequestException(
      'Campaign has no raceId — finish onboarding before generating a strategy.',
    )
  }
  if (!RACE_ID_PATTERN.test(raceId)) {
    throw new BadRequestException('Campaign raceId is malformed.')
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

    const [opposition, opportunities] = await Promise.all([
      this.runFor(plan.oppositionRunId),
      this.runFor(plan.opportunitiesRunId),
    ])

    // A failed run is terminal — never retry, just report it. The client
    // surfaces an error instead of polling forever.
    if (this.isFailed(opposition) || this.isFailed(opportunities)) {
      return { status: 'failed' }
    }

    // Safety net: a run that completed but whose section never persisted (and
    // stayed that way past the grace window) is stuck — report failed rather
    // than poll 'generating' forever.
    if (
      this.isStuck(opposition, plan.oppositionPersistedAt) ||
      this.isStuck(opportunities, plan.opportunitiesPersistedAt)
    ) {
      return { status: 'failed' }
    }

    // Ready only once BOTH sections are persisted (markers set in the same tx
    // as the rows). Gating on run status instead would race: a run can be
    // COMPLETED a beat before its rows land, yielding a hollow 'ready'.
    if (plan.oppositionPersistedAt && plan.opportunitiesPersistedAt) {
      return {
        status: 'ready',
        data: await this.readStrategicLandscape(plan.id),
      }
    }

    // If a needed dispatch produced no run (e.g. no dispatch queue configured
    // in preview), there's no way to make progress — report failed rather than
    // poll 'generating' forever.
    const dispatched = await this.dispatchPending(campaign, plan, brHashId, {
      opposition,
      opportunities,
    })
    return dispatched ? { status: 'generating' } : { status: 'failed' }
  }

  // Queue-consumer hook: when one of the two CAP runs completes, load its
  // artifact and persist that section. Each section persists independently;
  // the endpoint reports 'ready' once both sections are persisted.
  async onExperimentRunCompleted(run: ExperimentRun): Promise<void> {
    if (run.status !== ExperimentRunStatus.COMPLETED) return
    if (
      run.experimentType !== OPPOSITION &&
      run.experimentType !== OPPORTUNITIES
    ) {
      return
    }

    // A COMPLETED CAP run with no artifact can never be persisted. Treat it as
    // a failure so the endpoint reports 'failed' instead of sitting 'ready'.
    if (!run.artifactBucket || !run.artifactKey) {
      await this.experimentRuns.markFailed(
        run.runId,
        'completed run has no artifact location',
      )
      throw new Error(`run ${run.runId} completed without an artifact location`)
    }

    const plan = await this.findFirst({
      where:
        run.experimentType === OPPOSITION
          ? { oppositionRunId: run.runId }
          : { opportunitiesRunId: run.runId },
    })
    if (!plan) return

    // If loading, parsing, or persisting the artifact fails, the run was
    // marked COMPLETED upstream but its section never landed. Flip it to
    // FAILED so the endpoint reports 'failed' rather than a permanent
    // hollow 'ready'. Rethrow so the consumer logs it.
    try {
      const raw = await this.s3.getFile(run.artifactBucket, run.artifactKey)
      if (!raw) throw new Error('artifact is missing or empty')

      if (run.experimentType === OPPOSITION) {
        await this.persister.persistOpponents(plan.id, parseOpponents(raw))
      } else {
        const { opportunities, challenges } =
          parseOpportunitiesAndChallenges(raw)
        await this.persister.persistOpportunitiesAndChallenges(
          plan.id,
          opportunities,
          challenges,
        )
      }
    } catch (error) {
      await this.experimentRuns.markFailed(
        run.runId,
        error instanceof Error ? error.message : String(error),
      )
      throw error
    }
  }

  private runFor(runId: string | null): Promise<ExperimentRun | null> {
    if (!runId) return Promise.resolve(null)
    return this.experimentRuns.findUnique({ where: { runId } })
  }

  private isFailed(run: ExperimentRun | null): boolean {
    return run?.status === ExperimentRunStatus.FAILED
  }

  // COMPLETED, but its section never persisted, and the completion is older
  // than the grace window — the persist step silently dropped it.
  private isStuck(
    run: ExperimentRun | null,
    persistedAt: Date | null,
  ): boolean {
    return (
      run?.status === ExperimentRunStatus.COMPLETED &&
      !persistedAt &&
      isBefore(run.updatedAt, subMinutes(new Date(), PERSIST_GRACE_MINUTES))
    )
  }

  // Only dispatch an experiment that was never started. A failed run is NOT
  // re-dispatched (see getOrGenerateStrategicLandscape) — no retry loop.
  private needsDispatch(run: ExperimentRun | null): boolean {
    return run === null
  }

  // Returns true if at least one needed experiment was dispatched (or nothing
  // needed dispatching). False only when something needed dispatching and none
  // succeeded. A partial success returns true (generating): the successful run
  // is kept and the un-dispatched one retries on the next poll, so 'failed'
  // never flips back to 'generating'.
  private async dispatchPending(
    campaign: CampaignWith<'user'>,
    plan: CampaignStrategy,
    brHashId: string,
    runs: {
      opposition: ExperimentRun | null
      opportunities: ExperimentRun | null
    },
  ): Promise<boolean> {
    const dispatchOpposition = this.needsDispatch(runs.opposition)
    const dispatchOpportunities = this.needsDispatch(runs.opportunities)
    if (!dispatchOpposition && !dispatchOpportunities) return true

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

    let dispatchedAny = false

    if (dispatchOpposition) {
      const runId = await this.tryDispatch(OPPOSITION, base)
      if (runId) {
        try {
          await this.client.campaignStrategy.update({
            where: { id: plan.id },
            data: { oppositionRunId: runId },
          })
          dispatchedAny = true
        } catch (error) {
          // A transient DB fault linking the run must not 500 the poll: the
          // unlinked RUNNING row is reclaimed by the stale sweep and the next
          // poll re-dispatches.
          this.logger.error(
            { error, planId: plan.id, runId },
            'Failed to link oppositionRunId to plan',
          )
        }
      }
    }

    if (dispatchOpportunities) {
      const runId = await this.tryDispatch(OPPORTUNITIES, base)
      if (runId) {
        try {
          await this.client.campaignStrategy.update({
            where: { id: plan.id },
            data: { opportunitiesRunId: runId },
          })
          dispatchedAny = true
        } catch (error) {
          // See the opposition branch: don't 500 on a transient link failure.
          this.logger.error(
            { error, planId: plan.id, runId },
            'Failed to link opportunitiesRunId to plan',
          )
        }
      }
    }

    return dispatchedAny
  }

  // A dispatch failure (no queue, or SQS send error -> BadGateway) yields no
  // runId. Swallow it here so the caller reports 'failed' instead of letting a
  // 502 bubble out on the first failure.
  private async tryDispatch(
    type: typeof OPPOSITION | typeof OPPORTUNITIES,
    base: {
      organizationSlug: string
      clerkUserId: string
      params: StrategicLandscapeParams
    },
  ): Promise<string | undefined> {
    try {
      const run = await this.experimentRuns.dispatchRun({ type, ...base })
      return run?.runId
    } catch {
      // dispatchRun already marked the row FAILED before throwing. We swallow
      // and return undefined (so the caller reports 'failed' rather than a
      // 502), which leaves that FAILED row UNLINKED from the plan on purpose.
      // This orphan is intended and benign: a failed dispatch returns 'failed'
      // (terminal, so polling stops), so it is ~1 orphan row per attempt, not
      // per poll; the row is FAILED + unlinked, so it never affects campaign
      // status and the RUNNING-only stale sweep ignores it; and we keep it as
      // a monitoring breadcrumb of the SQS failure. We deliberately do NOT
      // link it: dispatchRun is shared (meetings/TCR/admin), and linking a
      // FAILED run would make needsDispatch treat a transient SQS blip as a
      // permanent failure with no retry.
      return undefined
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
    // The row was just upserted in this request; a null here is a real
    // data-integrity problem, not "empty data" to paper over.
    if (!plan) {
      throw new InternalServerErrorException(
        `CampaignStrategy ${campaignStrategyId} not found when reading sections`,
      )
    }
    return {
      opportunities: plan.opportunities.map((o) => o.content),
      challenges: plan.challenges.map((c) => c.content),
      opponents: plan.opponents.map((o) => ({
        fullName: o.fullName,
        partyAffiliation: o.partyAffiliation,
        incumbent: o.incumbent,
      })),
    }
  }
}
