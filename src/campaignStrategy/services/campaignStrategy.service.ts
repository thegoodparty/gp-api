import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
} from '@nestjs/common'
import { Campaign, CampaignStrategy, User } from '@prisma/client'
import { format } from 'date-fns'
import { z } from 'zod'
import { CampaignWith } from '@/campaigns/campaigns.types'
import { RacesService } from '@/elections/services/races.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { isUniqueConstraintError } from 'src/prisma/util/prismaErrors.util'
import { getUserFullName } from '@/users/util/users.util'
import { toLowerAndTrim } from '@/shared/util/strings.util'
import {
  CommunityEventsResponse,
  CommunityEventsResult,
  CommunityEventsResultSchema,
} from '@goodparty_org/contracts'
import {
  StrategicLandscapeResponse,
  StrategicLandscapeResult,
} from '../schemas/strategicLandscape.schema'
import {
  ApiCandidate,
  RaceCandidate,
  RaceContext,
} from '../types/electionApi.types'
import { CommunityEventsPromptContext } from './communityEvents.prompts'
import { CommunityEventsService } from './communityEvents.service'
import { ElectionApiService } from './electionApi.service'
import { StrategicLandscapeService } from './strategicLandscape.service'

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

const resolvePartyAffiliation = (details: Campaign['details']): string => {
  const parsed = CampaignDetailsSchema.safeParse(details)
  if (!parsed.success) return ''
  const party = parsed.data.party ?? ''
  const otherParty = parsed.data.otherParty ?? ''
  // 'Other' is a UI sentinel meaning "see otherParty for the real value".
  // Without otherParty there's no real affiliation to give the LLM —
  // return '' so orNotAvailable renders it as "not available" rather
  // than leaking the sentinel into the prompt.
  if (party === 'Other') return otherParty
  return party
}

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

const normalize = (value: string | null | undefined): string =>
  toLowerAndTrim(value ?? '').replace(/\s+/g, ' ')

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

// Max wall-clock time a single background generation is allowed to occupy
// the inFlight slot. The three parallel Gemini pipelines typically settle
// in 30-90s; this is a generous cap that lets the slot clear if Gemini
// wedges, so the next poll can re-kick instead of seeing 'generating'
// forever.
const GENERATION_WATCHDOG_MS = 5 * 60 * 1000

@Injectable()
export class CampaignStrategyService
  extends createPrismaBase(MODELS.CampaignStrategy)
  implements OnModuleDestroy
{
  // Per-pod in-flight tracker for strategic-landscape generation: keyed by
  // campaign id, holds the background generation promise. Polls that arrive
  // while a generation is in flight return { status: 'generating' } without
  // re-kicking. The map clears on settle (success OR failure), so a failed
  // run is auto-retried by the next poll. Cross-pod racing is handled at
  // persist time by the existing @@unique constraint +
  // isUniqueConstraintError fallback below.
  private readonly inFlight = new Map<number, Promise<void>>()

  // Separate slot for community-events. Kept independent of the landscape
  // slot so the pre-warm hook (kicked after office submit) and the
  // landscape generation can run concurrently without one blocking the
  // other behind a single per-campaign mutex.
  private readonly inFlightEvents = new Map<number, Promise<void>>()

  constructor(
    private readonly strategicLandscape: StrategicLandscapeService,
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

    // Resolve raceId synchronously up front so a 400 surfaces to THIS call
    // rather than getting swallowed in the background, where it would leave
    // the client stuck in a generating poll loop.
    const brHashId = resolveRaceId(campaign.details)

    const plan = await this.upsertForCampaign(campaign.id)
    const cached = await this.readStrategicLandscape(plan.id)
    if (cached) return { status: 'ready', data: cached }

    if (!this.inFlight.has(campaign.id)) {
      // map.set must happen synchronously before any await so a same-tick
      // second poll sees the entry. Node's event loop guarantees no
      // interleaving between the .has() check above and the .set() here.
      //
      // The outer .catch on the stored promise is belt-and-suspenders:
      // runGeneration already absorbs its own errors, but if the logger
      // itself throws inside the catch, the unwrapped promise would reject
      // and crash any Promise.allSettled / await caller down the line.
      const work = this.runGeneration(campaign, plan.id, brHashId).catch(
        () => undefined,
      )
      this.inFlight.set(campaign.id, work)
    }
    return { status: 'generating' }
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
    await Promise.allSettled([
      ...this.inFlight.values(),
      ...this.inFlightEvents.values(),
    ])
  }

  private async runGeneration(
    campaign: CampaignWith<'user'>,
    planId: number,
    brHashId: string,
  ): Promise<void> {
    try {
      // Watchdog: a wedged upstream (Gemini hang, election-api timeout)
      // would otherwise hold the inFlight slot until the pod restarts,
      // blocking every subsequent poll for this campaign. On timeout we
      // log + fall through to finally, which clears the slot; the next
      // poll then kicks a fresh attempt.
      await this.withWatchdog(
        this.runGenerationCore(campaign, planId, brHashId),
        GENERATION_WATCHDOG_MS,
      )
    } catch (error) {
      this.logger.error(
        {
          campaignId: campaign.id,
          err: error instanceof Error ? error.message : String(error),
        },
        'Strategic landscape generation failed; next poll will retry',
      )
    } finally {
      this.inFlight.delete(campaign.id)
    }
  }

  private async runGenerationCore(
    campaign: CampaignWith<'user'>,
    planId: number,
    brHashId: string,
  ): Promise<void> {
    const ctx = await this.buildRaceContext(campaign, brHashId)
    try {
      await this.strategicLandscape.generate(planId, campaign.id, ctx)
    } catch (error) {
      // If a concurrent generation (other pod / restart) wrote first, the
      // @@unique([campaignStrategyId, order]) trips here. Treat as "their
      // result wins" — the next poll's cache read will pick it up.
      if (!isUniqueConstraintError(error)) throw error
    }
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

  private async buildRaceContext(
    campaign: CampaignWith<'user'>,
    brHashId: string,
  ): Promise<RaceContext> {
    const fromApi = await this.electionApi.getRaceContext(brHashId)
    return {
      ...fromApi,
      candidates: campaign.user
        ? stitchIsUser(fromApi.candidates, campaign.user)
        : fromApi.candidates.map((c) => ({ ...c, isUser: false })),
      userFullName: campaign.user ? getUserFullName(campaign.user) : '',
      userPartyAffiliation: resolvePartyAffiliation(campaign.details),
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
  ): Promise<StrategicLandscapeResult | null> {
    const plan = await this.client.campaignStrategy.findUnique({
      where: { id: campaignStrategyId },
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
