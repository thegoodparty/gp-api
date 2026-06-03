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
// treated as stuck and re-dispatched on the next call (the persist step
// silently dropped it, e.g. a double DB fault). Within the window it still
// reads as in-flight so a poll between a run being marked COMPLETED and its
// rows landing can't trigger a spurious re-dispatch.
const PERSIST_GRACE_MINUTES = 5

// Max dispatches per section over a plan's lifetime. A failed or stuck section
// is re-dispatched when the endpoint is called again, so a user who hit a
// transient error can just retry. The cap stops a deterministic failure — or a
// client/attacker hammering the endpoint — from spawning unbounded Fargate
// runs. Enforced with an atomic conditional increment, so even a concurrent
// burst can claim at most this many slots.
const MAX_SECTION_ATTEMPTS = 3

// Per-section disposition that drives the endpoint status. 'redispatch' is the
// only state that starts a new run; the others are read off existing state.
// 'dead' = attempt cap reached (terminal failed). 'stalled' = a dispatch was
// attempted this call but its SQS send failed (the next call retries).
type SectionState = 'persisted' | 'inflight' | 'redispatch' | 'dead' | 'stalled'

// Both CAP experiments share one input contract.
type StrategicLandscapeParams =
  AgentJobContracts['opposition_research']['Input']

type DispatchBase = {
  organizationSlug: string
  clerkUserId: string
  params: StrategicLandscapeParams
}

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

    // Ready only once BOTH sections are persisted (markers set in the same tx
    // as the rows). Gating on run status instead would race: a run can be
    // COMPLETED a beat before its rows land, yielding a hollow 'ready'.
    if (plan.oppositionPersistedAt && plan.opportunitiesPersistedAt) {
      return {
        status: 'ready',
        data: await this.readStrategicLandscape(plan.id),
      }
    }

    // A failed or stuck section is re-dispatched (subject to the attempt cap),
    // not reported terminally — so a transient error is recoverable by calling
    // the endpoint again.
    return this.dispatchPending(campaign, plan, brHashId, {
      opposition: this.sectionState(opposition, plan.oppositionPersistedAt),
      opportunities: this.sectionState(
        opportunities,
        plan.opportunitiesPersistedAt,
      ),
    })
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

  // Classifies a section from its run + persistence marker. Only 'redispatch'
  // starts a new run (see SectionState).
  private sectionState(
    run: ExperimentRun | null,
    persistedAt: Date | null,
  ): SectionState {
    if (persistedAt) return 'persisted'
    if (run?.status === ExperimentRunStatus.RUNNING) return 'inflight'
    // COMPLETED but unpersisted: in-flight until the grace window (waiting for
    // its rows to land), then treated as stuck and re-dispatched.
    if (
      run?.status === ExperimentRunStatus.COMPLETED &&
      !isBefore(run.updatedAt, subMinutes(new Date(), PERSIST_GRACE_MINUTES))
    ) {
      return 'inflight'
    }
    // null, FAILED, or stuck-COMPLETED -> (re)dispatch.
    return 'redispatch'
  }

  // Dispatches the sections that need it (subject to the attempt cap) and
  // resolves the endpoint status. 'ready' is handled by the caller; this only
  // returns 'generating' or 'failed'.
  private async dispatchPending(
    campaign: CampaignWith<'user'>,
    plan: CampaignStrategy,
    brHashId: string,
    states: { opposition: SectionState; opportunities: SectionState },
  ): Promise<StrategicLandscapeResponse> {
    const dispatchOpposition = states.opposition === 'redispatch'
    const dispatchOpportunities = states.opportunities === 'redispatch'
    if (!dispatchOpposition && !dispatchOpportunities) {
      return this.statusFrom(states.opposition, states.opportunities)
    }

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

    // Stamp generationStartedAt only when kicking off work on an otherwise-idle
    // plan (nothing already in flight). A dispatch that joins an in-flight
    // generation keeps the original start, so trigger->ready duration is the
    // later persistedAt minus this. A retry of a failed/stuck section resets it.
    const freshStart =
      states.opposition !== 'inflight' && states.opportunities !== 'inflight'

    const opposition = dispatchOpposition
      ? await this.attemptOpposition(plan, base, freshStart)
      : states.opposition
    const opportunities = dispatchOpportunities
      ? await this.attemptOpportunities(plan, base, freshStart)
      : states.opportunities

    return this.statusFrom(opposition, opportunities)
  }

  // Claim a lifetime attempt slot for the opposition section, then dispatch.
  // The conditional increment is atomic, so a concurrent burst can claim at
  // most MAX_SECTION_ATTEMPTS slots in total — bounding the Fargate runs a
  // failing-and-retried (or maliciously hammered) section can spawn.
  private async attemptOpposition(
    plan: CampaignStrategy,
    base: DispatchBase,
    freshStart: boolean,
  ): Promise<SectionState> {
    const claimed = await this.client.campaignStrategy.updateMany({
      where: { id: plan.id, oppositionAttempts: { lt: MAX_SECTION_ATTEMPTS } },
      data: { oppositionAttempts: { increment: 1 } },
    })
    if (claimed.count === 0) return 'dead'

    const runId = await this.tryDispatch(OPPOSITION, base)
    if (!runId) return 'stalled'

    try {
      await this.client.campaignStrategy.update({
        where: { id: plan.id },
        data: {
          oppositionRunId: runId,
          ...(freshStart ? { generationStartedAt: new Date() } : {}),
        },
      })
    } catch (error) {
      // A transient DB fault linking the run must not 500 the call: the run is
      // dispatched and RUNNING, the unlinked row is reclaimed by the stale
      // sweep, and the next call re-dispatches (a slot was already consumed).
      this.logger.error(
        { error, planId: plan.id, runId },
        'Failed to link oppositionRunId to plan',
      )
    }
    return 'inflight'
  }

  private async attemptOpportunities(
    plan: CampaignStrategy,
    base: DispatchBase,
    freshStart: boolean,
  ): Promise<SectionState> {
    const claimed = await this.client.campaignStrategy.updateMany({
      where: {
        id: plan.id,
        opportunitiesAttempts: { lt: MAX_SECTION_ATTEMPTS },
      },
      data: { opportunitiesAttempts: { increment: 1 } },
    })
    if (claimed.count === 0) return 'dead'

    const runId = await this.tryDispatch(OPPORTUNITIES, base)
    if (!runId) return 'stalled'

    try {
      await this.client.campaignStrategy.update({
        where: { id: plan.id },
        data: {
          opportunitiesRunId: runId,
          ...(freshStart ? { generationStartedAt: new Date() } : {}),
        },
      })
    } catch (error) {
      // See attemptOpposition: don't 500 on a transient link failure.
      this.logger.error(
        { error, planId: plan.id, runId },
        'Failed to link opportunitiesRunId to plan',
      )
    }
    return 'inflight'
  }

  // Map the two post-dispatch section states to an endpoint status. A 'dead'
  // section (cap reached) means the plan can never complete, so it wins ->
  // failed. A 'stalled' section (SQS send failed this call) also reports
  // failed but is retryable next call; 'inflight' wins while nothing is dead.
  private statusFrom(
    opposition: SectionState,
    opportunities: SectionState,
  ): StrategicLandscapeResponse {
    if (opposition === 'dead' || opportunities === 'dead') {
      return { status: 'failed' }
    }
    if (opposition === 'inflight' || opportunities === 'inflight') {
      return { status: 'generating' }
    }
    return { status: 'failed' }
  }

  // A dispatch failure (no queue, or an SQS send error -> BadGateway) yields no
  // runId. Swallow it so the call reports 'stalled'/'failed' instead of a 502.
  // The FAILED row dispatchRun left behind stays unlinked: it's a monitoring
  // breadcrumb of the SQS failure, the RUNNING-only stale sweep ignores it, and
  // the section re-dispatches on the next call (a slot was already spent, so
  // it's bounded by MAX_SECTION_ATTEMPTS). We don't touch dispatchRun's throw
  // contract here because it's shared (meetings/TCR/admin).
  private async tryDispatch(
    type: typeof OPPOSITION | typeof OPPORTUNITIES,
    base: DispatchBase,
  ): Promise<string | undefined> {
    try {
      const run = await this.experimentRuns.dispatchRun({ type, ...base })
      return run?.runId
    } catch {
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
