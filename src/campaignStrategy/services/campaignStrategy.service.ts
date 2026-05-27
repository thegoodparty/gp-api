import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
} from '@nestjs/common'
import { Campaign, CampaignStrategy, User } from '@prisma/client'
import { z } from 'zod'
import { CampaignWith } from '@/campaigns/campaigns.types'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { isUniqueConstraintError } from 'src/prisma/util/prismaErrors.util'
import { getUserFullName } from '@/users/util/users.util'
import { toLowerAndTrim } from '@/shared/util/strings.util'
import {
  StrategicLandscapeResponse,
  StrategicLandscapeResult,
} from '../schemas/strategicLandscape.schema'
import {
  ApiCandidate,
  RaceCandidate,
  RaceContext,
} from '../types/electionApi.types'
import { ElectionApiService } from './electionApi.service'
import { StrategicLandscapeService } from './strategicLandscape.service'

// Defensive Zod parse over Campaign.details — the column is Prisma JSON,
// so we can't trust the shadow type at runtime. Only the keys we read here
// are declared; everything else passes through silently. raceId is the
// BallotReady race hash that election-api keys on.
const CampaignDetailsSchema = z
  .object({
    party: z.string().optional(),
    otherParty: z.string().optional(),
    raceId: z.string().optional(),
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
  // Per-pod in-flight tracker: keyed by campaign id, holds the background
  // generation promise. Polls that arrive while a generation is in flight
  // return { status: 'generating' } without re-kicking. The map clears on
  // settle (success OR failure), so a failed run is auto-retried by the
  // next poll. Cross-pod racing is handled at persist time by the existing
  // @@unique constraint + isUniqueConstraintError fallback below.
  private readonly inFlight = new Map<number, Promise<void>>()

  constructor(
    private readonly strategicLandscape: StrategicLandscapeService,
    private readonly electionApi: ElectionApiService,
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
    await Promise.allSettled(this.inFlight.values())
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

  private upsertForCampaign(campaignId: number): Promise<CampaignStrategy> {
    return this.client.campaignStrategy.upsert({
      where: { campaignId },
      create: { campaignId },
      update: {},
    })
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
}
