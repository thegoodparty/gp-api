import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
} from '@nestjs/common'
import {
  Campaign,
  CampaignStrategy,
  ExperimentRun,
  ExperimentRunStatus,
} from '../../generated/prisma'
import { format, isBefore, subMinutes } from 'date-fns'
import { z } from 'zod'
import { CampaignWith } from '@/campaigns/campaigns.types'
import { RacesService } from '@/elections/services/races.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { isUniqueConstraintError } from 'src/prisma/util/prismaErrors.util'
import { ExperimentRunsService } from '@/agentExperiments/services/experimentRuns.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { AgentJobContracts } from '@/generated/agent-job-contracts'
import {
  CommunityEventsResponse,
  CommunityEventsResult,
  CommunityEventsResultSchema,
} from '@goodparty_org/contracts'
import {
  parseOpponents,
  parseOpportunitiesAndChallenges,
  StrategicLandscapeResponse,
  StrategicLandscapeResult,
} from '../schemas/strategicLandscape.schema'
import { CommunityEventsPromptContext } from './communityEvents.prompts'
import { CommunityEventsService } from './communityEvents.service'
import {
  ElectionApiRaceNotFoundError,
  ElectionApiService,
} from './electionApi.service'
import { StrategicLandscapeParamsService } from './strategicLandscapeParams.service'
import { StrategicLandscapePersister } from './strategicLandscape.persister'

const OPPOSITION = 'opposition_research'
const OPPORTUNITIES = 'opportunities_and_challenges'

const EMPTY_COMMUNITY_EVENTS: CommunityEventsResult = { events: [] }

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

// Defensive Zod parse over Campaign.details — the column is Prisma JSON,
// so we can't trust the shadow type at runtime. Only the keys we read here
// are declared; everything else passes through silently. raceId is the
// BallotReady race hash that election-api keys on.
//
// All string/number fields use `.nullable()` in addition to `.partial()`
// because real campaign rows have explicit `null` values on these keys
// (e.g. `zip: null` from manual entry, `raceId: null` for non-BR races).
// `z.string().optional()` only accepts `string | undefined` — without
// `.nullable()` a single `null` field anywhere in details causes the
// whole `safeParse` to fail, which then makes raceId look empty even
// when it's a perfectly valid string. Breaks
// `getOrGenerateStrategicLandscape` (and events) on every campaign that
// has any nullable detail field populated as null.
const CampaignDetailsSchema = z
  .object({
    party: z.string().nullable().optional(),
    otherParty: z.string().nullable().optional(),
    raceId: z.string().nullable().optional(),
    zip: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    electionDate: z.string().nullable().optional(),
    officeTermLength: z.number().nullable().optional(),
  })
  .partial()

const resolveRaceId = (details: Campaign['details']): string => {
  const parsed = CampaignDetailsSchema.safeParse(details)
  const raceId = parsed.success ? (parsed.data.raceId ?? '').trim() : ''
  if (raceId.length === 0) {
    throw new BadRequestException(
      'Campaign has no raceId — finish onboarding before generating a strategy.',
    )
  }
  return raceId
}

const resolveElectionDate = (details: Campaign['details']): string => {
  const parsed = CampaignDetailsSchema.safeParse(details)
  const electionDate = parsed.success
    ? (parsed.data.electionDate ?? '').trim()
    : ''
  if (electionDate.length === 0) {
    throw new BadRequestException(
      'Campaign has no electionDate — finish onboarding before generating community events.',
    )
  }
  return electionDate
}

// Max wall-clock time a single background generation is allowed to occupy
// the inFlight slot. The community-events Gemini pipeline typically settles
// in 30-90s; this is a generous cap that lets the slot clear if Gemini
// wedges, so the next poll can re-kick instead of seeing 'generating'
// forever.
const GENERATION_WATCHDOG_MS = 5 * 60 * 1000

@Injectable()
export class CampaignStrategyService
  extends createPrismaBase(MODELS.CampaignStrategy)
  implements OnModuleDestroy
{
  // Per-pod in-flight tracker for community-events generation: keyed by
  // campaign id, holds the background generation promise. Polls that arrive
  // while a generation is in flight return { status: 'generating' } without
  // re-kicking. The map clears on settle (success OR failure), so a failed
  // run is auto-retried by the next poll. Cross-pod racing is handled at
  // persist time by the existing @@unique constraint +
  // isUniqueConstraintError fallback below.
  private readonly inFlightEvents = new Map<number, Promise<void>>()

  // Per-pod cache of campaigns whose race lookup against election-api
  // returned 404. The next runEventsGeneration for the same campaign would
  // just 404 again, and the next browser poll would re-kick the loop.
  // Caching here short-circuits the loop so the polling endpoint returns
  // `{ status: 'ready', data: <empty> }` and the webapp falls through to
  // its existing empty-state UI.
  //
  // We don't persist this. The 404 is almost always a dev-env data gap
  // that resolves on the next election-api dbt run; a pod restart is the
  // natural "retry" point and that's an acceptable cadence for what's
  // ultimately a transient data-import issue.
  private readonly raceDataUnavailable = new Set<number>()

  constructor(
    private readonly params: StrategicLandscapeParamsService,
    private readonly experimentRuns: ExperimentRunsService,
    private readonly persister: StrategicLandscapePersister,
    private readonly s3: S3Service,
    private readonly communityEvents: CommunityEventsService,
    private readonly electionApi: ElectionApiService,
    private readonly races: RacesService,
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

  async getOrGenerateCommunityEvents(
    campaign: CampaignWith<'user'>,
  ): Promise<CommunityEventsResponse> {
    // Resolve raceId + electionDate synchronously up front so a 400
    // surfaces to THIS call rather than getting swallowed in the
    // background, where it would leave the client stuck in a generating
    // poll loop.
    const brHashId = resolveRaceId(campaign.details)
    const electionDate = resolveElectionDate(campaign.details)

    // See raceDataUnavailable definition. Both pipelines (community
    // events and strategic landscape) call electionApi.getRaceContext,
    // so a 404 affects both — the cache is shared and either pipeline
    // hitting the 404 short-circuits the other too.
    if (this.raceDataUnavailable.has(campaign.id)) {
      return { status: 'ready', data: EMPTY_COMMUNITY_EVENTS }
    }

    const plan = await this.upsertForCampaign(campaign.id)
    const cached = await this.readCommunityEvents(plan.id)
    if (cached) return { status: 'ready', data: cached }

    if (!this.inFlightEvents.has(campaign.id)) {
      const work = this.runEventsGeneration(
        campaign,
        plan.id,
        brHashId,
        electionDate,
      ).catch(() => undefined)
      this.inFlightEvents.set(campaign.id, work)
    }
    return { status: 'generating' }
  }

  // Graceful-shutdown hook. NestJS calls onModuleDestroy on shutdown; we
  // wait for any background generation to settle before the process exits
  // so in-flight DB writes finish cleanly. Also useful in tests to wait
  // for kicked-off work without polling.
  async onModuleDestroy(): Promise<void> {
    await this.drainInFlight()
  }

  async drainInFlight(): Promise<void> {
    // allSettled (not all) so a rejecting promise — should never happen
    // given the outer .catch on stored promises, but defense in depth —
    // can't crash callers.
    await Promise.allSettled([...this.inFlightEvents.values()])
  }

  private async runEventsGeneration(
    campaign: CampaignWith<'user'>,
    planId: number,
    brHashId: string,
    electionDate: string,
  ): Promise<void> {
    try {
      await this.withWatchdog(
        this.runEventsGenerationCore(campaign, planId, brHashId, electionDate),
        GENERATION_WATCHDOG_MS,
      )
    } catch (error) {
      if (error instanceof ElectionApiRaceNotFoundError) {
        this.markRaceUnavailable(campaign.id, brHashId, 'community-events')
        return
      }
      this.logger.error(
        {
          campaignId: campaign.id,
          err: error instanceof Error ? error.message : String(error),
        },
        'Community events generation failed; next poll will retry',
      )
    } finally {
      this.inFlightEvents.delete(campaign.id)
    }
  }

  // Add the campaign to the per-pod raceDataUnavailable cache so
  // subsequent polls short-circuit to `{ status: 'ready', data: <empty> }`
  // instead of re-kicking generation that will 404 again. Logged at
  // warn (not error) because a missing Race row is usually a dev-env
  // data gap, not an outage worth paging on.
  private markRaceUnavailable(
    campaignId: number,
    brHashId: string,
    pipeline: 'strategic-landscape' | 'community-events',
  ): void {
    this.raceDataUnavailable.add(campaignId)
    this.logger.warn(
      { campaignId, raceId: brHashId, pipeline },
      'election-api has no data for this race; marking campaign as race-data-unavailable so polling stops looping',
    )
  }

  private async runEventsGenerationCore(
    campaign: CampaignWith<'user'>,
    planId: number,
    brHashId: string,
    electionDate: string,
  ): Promise<void> {
    const ctx = await this.buildEventsContext(campaign, brHashId, electionDate)
    await this.communityEvents.generate(planId, campaign.id, ctx)
  }

  // Build the community-events prompt context by combining election-api's
  // race details (officialOfficeName, officeLevel, primaryElectionDate)
  // with campaign.details (state, city) and a district zip resolved from
  // the BR race ID via RacesService. The resolver returns every zip the
  // race's position touches; we hand the full list to the LLM so it can
  // ground events across the whole district (a city-council race may
  // span 3-5 zips, a state-rep race 20-30). For statewide races where
  // the resolver returns more than STATEWIDE_ZIP_THRESHOLD zips, we drop
  // the zip entirely — listing them would add noise without precision,
  // and the LLM can reason from officeName + state + city alone.
  private async buildEventsContext(
    campaign: CampaignWith<'user'>,
    brHashId: string,
    electionDate: string,
  ): Promise<CommunityEventsPromptContext> {
    const race = await this.electionApi.getRaceContext(brHashId)
    const parsedDetails = CampaignDetailsSchema.safeParse(campaign.details)
    const details = parsedDetails.success ? parsedDetails.data : {}

    const detailZip = (details.zip ?? '').trim()
    const userZip = (campaign.user?.zip ?? '').trim()
    const zip = await this.resolveDistrictZip(brHashId, [detailZip, userZip])

    return {
      today: format(new Date(), 'yyyy-MM-dd'),
      electionDate,
      primaryElectionDate: race.primaryElectionDate ?? null,
      state: details.state ?? race.state ?? null,
      city: details.city ?? null,
      zip,
      officeName: race.officialOfficeName ?? race.candidateOffice ?? null,
      officeLevel: race.officeLevel ?? null,
    }
  }

  // Resolve a comma-joined district zip list from the BR race id via
  // election-api's position → zip-codes endpoint, with three branches:
  //
  //   1. Resolver returned 1-STATEWIDE_ZIP_THRESHOLD zips →
  //      return them comma-joined. The LLM gets the full district.
  //   2. Resolver returned >STATEWIDE_ZIP_THRESHOLD zips →
  //      return '' (statewide skip). We do NOT fall back to the
  //      candidate's own zip because for statewide races the home zip
  //      isn't representative of where the campaign actually operates.
  //      The prompt's orNotAvailable() renders the absent zip as
  //      "not available"; the LLM reasons from officeName + state + city.
  //   3. Resolver returned 0 zips OR threw →
  //      try the candidate's own zips (detail → user) so generation
  //      still has *some* geographic signal when BR data is missing.
  //
  // Logs at info for the statewide branch and warn for the error branch
  // so we can spot how often each fires in production.
  private static readonly STATEWIDE_ZIP_THRESHOLD = 75
  private async resolveDistrictZip(
    brHashId: string,
    candidateFallbacks: string[],
  ): Promise<string> {
    const fallback = (): string =>
      candidateFallbacks.find((z) => z.length > 0) ?? ''
    try {
      const zips = await this.races.getZipCodesByRaceId(brHashId)
      if (zips.length === 0) return fallback()
      if (zips.length > CampaignStrategyService.STATEWIDE_ZIP_THRESHOLD) {
        this.logger.info(
          { raceId: brHashId, zipCount: zips.length },
          'District zip resolver returned statewide-sized array; dropping zip from the prompt so the LLM reasons from office + state instead',
        )
        return ''
      }
      return zips.join(', ')
    } catch (error) {
      this.logger.warn(
        {
          raceId: brHashId,
          err: error instanceof Error ? error.message : String(error),
        },
        'District zip resolver failed; falling back to campaign/user zip',
      )
      return fallback()
    }
  }

  private async withWatchdog<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`generation watchdog tripped after ${ms}ms`)),
        ms,
      )
    })
    try {
      return await Promise.race([work, timeout])
    } finally {
      if (timer) clearTimeout(timer)
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

    // Building params calls election-api. If the race isn't found (404) or
    // election-api is otherwise unavailable, there's nothing to dispatch —
    // report a terminal 'failed' so the client stops polling instead of
    // re-hammering election-api with a 500/502 on every poll.
    let params: StrategicLandscapeParams
    try {
      params = await this.params.build(campaign, brHashId)
    } catch (error) {
      if (
        error instanceof ElectionApiRaceNotFoundError ||
        error instanceof BadGatewayException
      ) {
        this.logger.warn(
          { error, campaignId: campaign.id, raceId: brHashId },
          'election-api unavailable while building strategy params; reporting failed',
        )
        return { status: 'failed' }
      }
      throw error
    }
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

  private async upsertForCampaign(
    campaignId: number,
  ): Promise<CampaignStrategy> {
    // Prisma's `upsert` is not transactional in Postgres — it issues a
    // SELECT followed by an INSERT-or-UPDATE. Two requests landing in the
    // same race window (e.g. the two pre-warm POSTs fired back-to-back
    // from OnboardingFlow) both see "no row", both try INSERT, and the
    // second trips the @@unique([campaign_id]) constraint with P2002.
    // The PrismaExceptionFilter then surfaces that as a 409 to the
    // client. The row exists by the time we see P2002, so re-fetch it.
    try {
      return await this.client.campaignStrategy.upsert({
        where: { campaignId },
        create: { campaignId },
        update: {},
      })
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error
      return this.client.campaignStrategy.findUniqueOrThrow({
        where: { campaignId },
      })
    }
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

  // Defensive read of the JSON column — Prisma types the field as
  // `Prisma.JsonValue`, so we revalidate with Zod before returning. A
  // shape mismatch is treated as "no cache" so the next poll re-generates
  // instead of serving stale/malformed data to the UI.
  private async readCommunityEvents(
    campaignStrategyId: number,
  ): Promise<CommunityEventsResult | null> {
    const plan = await this.client.campaignStrategy.findUnique({
      where: { id: campaignStrategyId },
      select: { communityEvents: true },
    })
    if (!plan?.communityEvents) return null
    const parsed = CommunityEventsResultSchema.safeParse(plan.communityEvents)
    if (!parsed.success) {
      this.logger.warn(
        { campaignStrategyId, issues: parsed.error.issues },
        'community_events JSON failed schema validation; treating as no-cache',
      )
      return null
    }
    return parsed.data
  }
}
