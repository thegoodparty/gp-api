import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { isValid, parseISO, subMinutes } from 'date-fns'
import {
  Campaign,
  ExperimentRun,
  Prisma,
  TcrCompliance,
  TcrComplianceStatus,
  User,
} from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { QueueProducerService } from '../../../queue/producer/queueProducer.service'
import {
  MessageGroup,
  QueueType,
  TcrComplianceStatusCheckMessage,
} from '../../../queue/queue.types'
import { getUserFullName } from '../../../users/util/users.util'
import {
  PeerlyIdentityProfile,
  PeerlyIdentityProfileResponseBody,
  PeerlyIdentityUseCase,
} from '../../../vendors/peerly/peerly.types'
import { PEERLY_USECASE } from '../../../vendors/peerly/services/peerly.const'
import { PeerlyIdentityService } from '../../../vendors/peerly/services/peerlyIdentity.service'
import { WebsitesService } from '../../../websites/services/websites.service'
import {
  CreateAgenticTcrCompliancePayload,
  CreateTcrCompliancePayload,
} from '../campaignTcrCompliance.types'
import { CampaignsService } from '../../services/campaigns.service'
import { CrmCampaignsService } from '../../services/crmCampaigns.service'
import { ComplianceStateService } from './complianceState.service'
import { SubmitToPeerlyDto } from '../schemas/submitToPeerlyDto.schema'
import { ComplianceStage, SubmitToPeerlyOutput } from '@goodparty_org/contracts'
import { ExperimentRunsService } from '../../../agentExperiments/services/experimentRuns.service'
import { AgenticComplianceKickoffMessage } from '../../../queue/queue.types'
import { ExperimentRunStatus } from '@prisma/client'

const TCR_COMPLIANCE_CHECK_INTERVAL = process.env.TCR_COMPLIANCE_CHECK_INTERVAL
  ? parseInt(process.env.TCR_COMPLIANCE_CHECK_INTERVAL)
  : 12 * 60 * 60 // Defaults to 12 hrs

const AGENTIC_KICKOFF_SWEEP_INTERVAL = process.env
  .AGENTIC_KICKOFF_SWEEP_INTERVAL
  ? parseInt(process.env.AGENTIC_KICKOFF_SWEEP_INTERVAL)
  : 10 * 60

const AGENTIC_KICKOFF_STALENESS_MINUTES = 10

// Pre-Peerly claim TTL: a claim older than this is treated as stale (failed
// without rollback) and re-claimable. Bounds the Peerly call's normal duration
// plus a comfortable margin; tune if Peerly latency drifts.
const PEERLY_SUBMISSION_CLAIM_TTL_MINUTES = 5

// Agentic dispatch claim TTL: a claim older than this is treated as stale
// (worker crashed between claim and dispatchRun completion) and re-claimable.
// Bounds dispatchRun's normal duration (SQS sendMessage + tcr_compliance write)
// plus a comfortable margin.
const AGENTIC_DISPATCH_CLAIM_TTL_MINUTES = 5

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/

type PeerlySubmissionResult = {
  peerlyIdentityId: string
  peerlyIdentityProfileLink: string | null
  peerly10DLCBrandSubmissionKey: string | null
  cvVerificationId: string | null
}

@Injectable()
export class CampaignTcrComplianceService extends createPrismaBase(
  MODELS.TcrCompliance,
) {
  constructor(
    private readonly peerlyIdentityService: PeerlyIdentityService,
    private readonly websitesService: WebsitesService,
    private readonly campaignsService: CampaignsService,
    private readonly crmCampaignsService: CrmCampaignsService,
    private readonly complianceStateService: ComplianceStateService,
    private queueService: QueueProducerService,
    private readonly experimentRunsService: ExperimentRunsService,
  ) {
    super()
  }

  @Interval(AGENTIC_KICKOFF_SWEEP_INTERVAL * 1000)
  private async sweepStrandedAgenticKickoffs() {
    const cutoff = subMinutes(new Date(), AGENTIC_KICKOFF_STALENESS_MINUTES)
    const stranded = await this.model.findMany({
      where: {
        status: TcrComplianceStatus.submitted,
        peerlyIdentityId: null,
        kickoffSentAt: null,
        createdAt: { lt: cutoff },
      },
      include: {
        campaign: { include: { user: true } },
      },
    })

    if (!stranded.length) {
      return
    }

    this.logger.warn(
      { count: stranded.length, cutoff: cutoff.toISOString() },
      `[TCR Compliance] Sweeping ${stranded.length} stranded agentic kickoff(s)`,
    )

    for (const record of stranded) {
      const clerkUserId = record.campaign?.user?.clerkId
      if (!clerkUserId) {
        this.logger.error(
          { tcrComplianceId: record.id, campaignId: record.campaignId },
          '[TCR Compliance] Stranded agentic record has no Clerk user; skipping',
        )
        continue
      }

      try {
        await this.queueService.sendMessage(
          {
            type: QueueType.AGENTIC_COMPLIANCE_KICKOFF,
            data: {
              campaignId: record.campaignId,
              tcrComplianceId: record.id,
              clerkUserId,
            },
          },
          `${MessageGroup.agenticComplianceKickoff}-${record.campaignId}`,
          {
            deduplicationId: `agentic-compliance-${record.id}-recover-${Date.now()}`,
            throwOnError: true,
          },
        )

        await this.model.update({
          where: { id: record.id },
          data: { kickoffSentAt: new Date() },
        })
      } catch (err) {
        this.logger.error(
          { err, tcrComplianceId: record.id },
          '[TCR Compliance] Failed to re-enqueue stranded agentic kickoff',
        )
      }
    }
  }

  @Interval(TCR_COMPLIANCE_CHECK_INTERVAL * 1000) // This will run based on the environment variable
  private async bootstrapTcrComplianceCheck() {
    const pendingTcrCompliances = await this.model.findMany({
      where: {
        status: TcrComplianceStatus.pending,
      },
    })
    if (pendingTcrCompliances.length) {
      this.logger.debug(
        { pendingTcrCompliances },
        `Queuing up pendingTcrCompliances =>`,
      )
      await Promise.allSettled(
        pendingTcrCompliances.map((tcrCompliance) =>
          this.queueService.sendMessage({
            type: QueueType.TCR_COMPLIANCE_STATUS_CHECK,
            data: { tcrCompliance } as TcrComplianceStatusCheckMessage,
          }),
        ),
      )
    } else {
      this.logger.debug(
        'No pending TCR Compliances need checking at this time.',
      )
    }
  }

  async fetchByCampaignId(campaignId: number) {
    return this.model.findUnique({
      where: { campaignId },
    })
  }

  // TODO: Refactor this flow to persist the Peerly Identity ID and other
  //  relevant data in the TCR Compliance record as we go, and then use that to
  //  determine flow progress instead of calling Peerly for everything.
  //  Once we do so, the UI and other consumers that are determining logic flows
  //  based on existence of TcrCompliance records will need to be updated to
  //  reflect this change.
  async create(
    user: User,
    campaign: Campaign,
    tcrComplianceCreatePayload: CreateTcrCompliancePayload,
  ) {
    const { domain } = await this.websitesService.findFirstOrThrow({
      where: {
        campaignId: campaign.id,
      },
      include: {
        domain: true,
      },
    })
    if (!domain) {
      throw new BadRequestException(
        'Campaign must have a domain to create TCR compliance',
      )
    }

    const peerlyResult = await this.submitToPeerly(
      user,
      campaign,
      tcrComplianceCreatePayload,
      domain.name,
    )

    const newTcrCompliance = {
      ...tcrComplianceCreatePayload,
      postalAddress: campaign.formattedAddress!,
      campaignId: campaign.id,
      peerlyIdentityId: peerlyResult.peerlyIdentityId,
      peerlyIdentityProfileLink: peerlyResult.peerlyIdentityProfileLink,
      peerly10DLCBrandSubmissionKey: peerlyResult.peerly10DLCBrandSubmissionKey,
      peerlyCvVerificationId: peerlyResult.cvVerificationId,
    }

    this.logger.debug(
      { newTcrCompliance },
      '[TCR Compliance] Step 5: Creating TCR Compliance record:',
    )

    const createdTcrCompliance = await this.model.create({
      data: newTcrCompliance,
    })

    this.logger.info(
      `[TCR Compliance] Flow completed for campaignId=${campaign.id}, ` +
        `tcrComplianceId=${createdTcrCompliance.id}, ` +
        `peerlyIdentityId=${createdTcrCompliance.peerlyIdentityId}`,
    )

    return createdTcrCompliance
  }

  private async submitToPeerly(
    user: User,
    campaign: Campaign,
    tcrComplianceCreatePayload: CreateTcrCompliancePayload,
    domainName: string,
  ): Promise<PeerlySubmissionResult> {
    const {
      ein,
      filingUrl,
      email,
      phone,
      officeLevel,
      fecCommitteeId,
      committeeType,
    } = tcrComplianceCreatePayload

    const userFullName = getUserFullName(user)
    const { ballotLevel } = campaign.details as { ballotLevel?: string }

    this.logger.info(
      `[TCR Compliance] Starting registration flow for ` +
        `campaignId=${campaign.id}, userId=${user.id}, ` +
        `userName="${userFullName}", ein=${ein}, ` +
        `ballotLevel=${ballotLevel || 'NOT_SET'}`,
    )

    const tcrIdentityName = this.peerlyIdentityService.getTCRIdentityName(
      userFullName,
      ein,
    )
    this.logger.debug(
      `[TCR Compliance] Step 1: tcrIdentityName => ${tcrIdentityName}`,
    )

    const identities = await this.peerlyIdentityService.getIdentities(campaign)
    const existingIdentity = identities.find(
      (identity) => identity.identity_name === tcrIdentityName,
    )

    if (existingIdentity) {
      this.logger.debug(
        { existingIdentity },
        '[TCR Compliance] Step 1: Existing Identity found, skipping creation:',
      )
    } else {
      this.logger.debug(
        `[TCR Compliance] Step 1: No existing identity found, creating new one`,
      )
    }

    const tcrComplianceIdentity =
      existingIdentity ||
      (await this.peerlyIdentityService.createIdentity(
        tcrIdentityName,
        campaign,
      ))
    if (!tcrComplianceIdentity) {
      throw new BadGatewayException(
        'Peerly did not return an identity after creation',
      )
    }
    const peerlyIdentityId = tcrComplianceIdentity.identity_id

    let existingIdentityProfileResponse: PeerlyIdentityProfileResponseBody | null =
      null
    try {
      existingIdentityProfileResponse =
        await this.peerlyIdentityService.getIdentityProfile(
          peerlyIdentityId,
          campaign,
        )
    } catch (error) {
      if (error instanceof NotFoundException) {
        existingIdentityProfileResponse = null
      } else {
        throw error
      }
    }

    if (existingIdentityProfileResponse) {
      this.logger.debug(
        `[TCR Compliance] Step 2: Existing Identity Profile found, skipping creation`,
      )
    } else {
      this.logger.debug(`[TCR Compliance] Step 2: Submitting Identity Profile`)
    }

    const peerlyIdentityProfileResponse: PeerlyIdentityProfileResponseBody | null =
      existingIdentityProfileResponse ||
      (await this.peerlyIdentityService.submitIdentityProfile(
        peerlyIdentityId,
        campaign,
      )) ||
      null

    const peerlyIdentityProfileLink =
      peerlyIdentityProfileResponse?.link || null

    const identityProfile: PeerlyIdentityProfile | null =
      peerlyIdentityProfileResponse?.profile ?? null

    let peerly10DLCBrandSubmissionKey: string | null = null
    // Apparently, duck-typing whether `vertical` has been set or not, is the
    //  _only_ way to determine whether or not the given Identity has a 10DLC
    //  "brand" submitted for it or not. See Peerly Slack discussion here:
    //  https://goodpartyorg.slack.com/archives/C09H3K02LLV/p1759788426640679
    if (identityProfile?.vertical) {
      this.logger.debug(
        `[TCR Compliance] Step 3: Existing 10DLC Brand derived from ` +
          `IdentityProfile (vertical=${identityProfile.vertical}), ` +
          `skipping creation`,
      )
    } else {
      this.logger.debug(`[TCR Compliance] Step 3: Submitting 10DLC Brand`)
      peerly10DLCBrandSubmissionKey =
        (await this.peerlyIdentityService.submit10DlcBrand(
          peerlyIdentityId,
          tcrComplianceCreatePayload,
          campaign,
          domainName,
        )) || null
    }

    const existingCampaignVerifyRequest =
      await this.peerlyIdentityService.getCampaignVerifyRequest(
        peerlyIdentityId,
        campaign,
      )

    let cvVerificationId: string | null = null
    if (existingCampaignVerifyRequest?.verification_status) {
      this.logger.debug(
        `[TCR Compliance] Step 4: Existing Campaign Verify Request found ` +
          `w/ status ${existingCampaignVerifyRequest.verification_status}, ` +
          `skipping creation`,
      )
    } else {
      this.logger.debug(
        `[TCR Compliance] Step 4: Submitting Campaign Verify Request for ` +
          `campaignId=${campaign.id}`,
      )

      const cvResponse =
        await this.peerlyIdentityService.submitCampaignVerifyRequest(
          {
            ein,
            filingUrl,
            peerlyIdentityId,
            email,
            phone,
            officeLevel,
            fecCommitteeId: fecCommitteeId ?? null,
            committeeType: committeeType,
          },
          user,
          campaign,
          domainName,
        )
      cvVerificationId = cvResponse?.verification_id ?? null
      this.logger.info(
        `[TCR Compliance] Step 4 SUCCESS: Campaign Verify Request submitted ` +
          `for campaignId=${campaign.id}`,
      )
    }

    return {
      peerlyIdentityId,
      peerlyIdentityProfileLink,
      peerly10DLCBrandSubmissionKey,
      cvVerificationId,
    }
  }

  async submitToPeerlyForAgent(
    user: User,
    campaign: Campaign,
    input: SubmitToPeerlyDto,
  ): Promise<SubmitToPeerlyOutput> {
    const existing = await this.fetchByCampaignId(campaign.id)
    if (!existing) {
      throw new NotFoundException(
        `TcrCompliance record not found for campaignId=${campaign.id}; ` +
          `the agentic compliance flow must be initialized first`,
      )
    }

    if (existing.peerlyIdentityId) {
      return this.buildSubmitToPeerlyResponse(existing)
    }

    // Stage gate: only proceed when the candidate's website is live + the
    // domain is registered (derived stage = awaiting_pin with identity still
    // null). Reject all earlier stages so an agent can't kick a Peerly brand
    // submission for an unverified/unregistered domain.
    const stateBeforeSubmit =
      await this.complianceStateService.findStateForCampaign(campaign.id)
    if (stateBeforeSubmit.stage !== ComplianceStage.awaiting_pin) {
      throw new UnprocessableEntityException(
        `Cannot submit TCR registration to Peerly until the candidate's ` +
          `website is published and live. Current compliance stage: ` +
          `${stateBeforeSubmit.stage}. Wait for stage = awaiting_pin.`,
      )
    }

    // Pre-Peerly claim: only one concurrent caller may proceed past this
    // point. The TTL allows re-claim if a prior caller crashed mid-flight
    // without clearing its claim.
    const staleBefore = subMinutes(
      new Date(),
      PEERLY_SUBMISSION_CLAIM_TTL_MINUTES,
    )
    const claimTimestamp = new Date()
    const claim = await this.model.updateMany({
      where: {
        id: existing.id,
        peerlyIdentityId: null,
        OR: [
          { peerlySubmissionStartedAt: null },
          { peerlySubmissionStartedAt: { lt: staleBefore } },
        ],
      },
      data: { peerlySubmissionStartedAt: claimTimestamp },
    })

    if (claim.count === 0) {
      const current = await this.fetchByCampaignId(campaign.id)
      if (current?.peerlyIdentityId) {
        return this.buildSubmitToPeerlyResponse(current)
      }
      throw new ConflictException(
        `A Peerly submission is already in progress for ` +
          `campaignId=${campaign.id}; retry in a few seconds.`,
      )
    }

    // Strip leading www. so Peerly's 10DLC brand `website` + `email` fields
    // and the persisted websiteDomain all use the apex domain — matching the
    // legacy create() path (which sources from Domain.name, an apex domain).
    const hostname = new URL(input.websiteUrl).hostname.replace(/^www\./, '')
    const helperPayload: CreateTcrCompliancePayload = {
      ein: input.ein,
      committeeName: input.committeeName,
      filingUrl: input.filingUrl,
      email: input.email,
      phone: input.phone,
      officeLevel: input.officeLevel,
      fecCommitteeId: input.fecCommitteeId,
      committeeType: input.committeeType,
      websiteDomain: hostname,
    }

    let peerlyResult: PeerlySubmissionResult
    try {
      peerlyResult = await this.submitToPeerly(
        user,
        campaign,
        helperPayload,
        hostname,
      )
    } catch (error) {
      // Roll back only this caller's claim by matching the exact timestamp we
      // wrote. A TTL re-claimant (caller B, after our call exceeded TTL) will
      // have a different timestamp, so its in-flight claim isn't disturbed.
      await this.model.updateMany({
        where: {
          id: existing.id,
          peerlyIdentityId: null,
          peerlySubmissionStartedAt: claimTimestamp,
        },
        data: { peerlySubmissionStartedAt: null },
      })
      throw error
    }

    const updated = await this.model.update({
      where: { id: existing.id },
      data: {
        ein: input.ein,
        committeeName: input.committeeName,
        filingUrl: input.filingUrl,
        email: input.email,
        phone: input.phone,
        officeLevel: input.officeLevel,
        fecCommitteeId: input.fecCommitteeId ?? null,
        committeeType: input.committeeType,
        websiteDomain: hostname,
        postalAddress: campaign.formattedAddress ?? existing.postalAddress,
        peerlyIdentityId: peerlyResult.peerlyIdentityId,
        peerlyIdentityProfileLink: peerlyResult.peerlyIdentityProfileLink,
        peerly10DLCBrandSubmissionKey:
          peerlyResult.peerly10DLCBrandSubmissionKey,
        // Peerly's GET-CV-request response doesn't carry verification_id, so
        // when the helper skipped CV submission (existing CV found), it
        // returns null. Fall back to the persisted value so a real ID isn't
        // overwritten on retry.
        peerlyCvVerificationId:
          peerlyResult.cvVerificationId ?? existing.peerlyCvVerificationId,
      },
    })

    this.logger.info(
      `[TCR Compliance] submitToPeerlyForAgent complete for ` +
        `campaignId=${campaign.id}, tcrComplianceId=${updated.id}, ` +
        `peerlyIdentityId=${updated.peerlyIdentityId}`,
    )

    return this.buildSubmitToPeerlyResponse(updated)
  }

  private async buildSubmitToPeerlyResponse(
    record: TcrCompliance,
  ): Promise<SubmitToPeerlyOutput> {
    const state = await this.complianceStateService.findStateForCampaign(
      record.campaignId,
    )
    if (!record.peerlyIdentityId) {
      throw new BadGatewayException(
        `Cannot build submit-to-peerly response for tcrComplianceId=` +
          `${record.id}: peerlyIdentityId is unexpectedly null`,
      )
    }
    return {
      tcrComplianceId: record.id,
      peerlyIdentityId: record.peerlyIdentityId,
      peerlyIdentityProfileLink: record.peerlyIdentityProfileLink,
      peerly10DLCBrandSubmissionKey: record.peerly10DLCBrandSubmissionKey,
      peerlyVerificationId: record.peerlyCvVerificationId,
      stage: state.stage,
      pinDeliveryChannels: { email: record.email, phone: record.phone },
    }
  }

  async createAgentic(
    user: User,
    campaign: Campaign,
    payload: CreateAgenticTcrCompliancePayload,
  ) {
    if (!user.clerkId) {
      throw new BadRequestException(
        'User must have a Clerk ID to start the agentic compliance flow',
      )
    }

    const existing = await this.fetchByCampaignId(campaign.id)
    const isRetryableFailure =
      existing?.status === TcrComplianceStatus.error ||
      existing?.status === TcrComplianceStatus.rejected

    if (existing && !isRetryableFailure) {
      return { record: existing, created: false }
    }

    const {
      ein,
      committeeName,
      websiteDomain,
      placeId,
      formattedAddress,
      ...rest
    } = payload

    let record: TcrCompliance
    try {
      record = await this.client.$transaction(
        async (tx) => {
          const updatedCampaign = await this.campaignsService.updateJsonFields(
            campaign.id,
            {
              details: {
                einNumber: ein,
                campaignCommittee: committeeName,
              },
              placeId,
              formattedAddress,
            },
            false,
            undefined,
            tx,
          )

          if (!updatedCampaign) {
            throw new NotFoundException(
              `Campaign ${campaign.id} not found while updating compliance details`,
            )
          }

          if (existing) {
            await tx.tcrCompliance.deleteMany({ where: { id: existing.id } })
          }

          return tx.tcrCompliance.create({
            data: {
              ...rest,
              ein,
              committeeName,
              websiteDomain: websiteDomain ?? '',
              postalAddress: updatedCampaign.formattedAddress ?? '',
              campaignId: campaign.id,
            },
          })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
    } catch (err) {
      if (
        err instanceof PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await this.fetchByCampaignId(campaign.id)
        if (raced) {
          this.logger.info(
            `[TCR Compliance] Agentic kickoff lost race for campaignId=${campaign.id}; returning record created by parallel request`,
          )
          return { record: raced, created: false }
        }
        this.logger.error(
          { err, campaignId: campaign.id, target: err.meta?.target },
          '[TCR Compliance] P2002 on create with no racing record found — likely a unique constraint other than campaignId',
        )
        throw new BadGatewayException(
          'Failed to create TCR compliance record due to a constraint violation',
        )
      }
      throw err
    }

    try {
      await this.queueService.sendMessage(
        {
          type: QueueType.AGENTIC_COMPLIANCE_KICKOFF,
          data: {
            campaignId: campaign.id,
            tcrComplianceId: record.id,
            clerkUserId: user.clerkId,
          },
        },
        `${MessageGroup.agenticComplianceKickoff}-${campaign.id}`,
        {
          deduplicationId: `agentic-compliance-${record.id}`,
          throwOnError: true,
        },
      )
    } catch (err) {
      try {
        await this.model.update({
          where: { id: record.id },
          data: { status: TcrComplianceStatus.error },
        })
      } catch (updateErr) {
        this.logger.error(
          { updateErr, tcrComplianceId: record.id },
          '[TCR Compliance] Failed to mark record as error after SQS send failure; sweep will recover',
        )
      }
      throw err
    }

    await this.model.update({
      where: { id: record.id },
      data: { kickoffSentAt: new Date() },
    })

    try {
      await this.crmCampaignsService.trackCampaign(campaign.id)
    } catch (err) {
      this.logger.error(
        { err, campaignId: campaign.id },
        '[TCR Compliance] CRM tracking failed after agentic kickoff enqueued; agent run will continue',
      )
    }

    this.logger.info(
      `[TCR Compliance] Agentic flow kicked off for campaignId=${campaign.id}, tcrComplianceId=${record.id}`,
    )

    return { record, created: true }
  }

  async handleAgenticKickoff(message: AgenticComplianceKickoffMessage) {
    const { campaignId, tcrComplianceId, clerkUserId } = message

    const record = await this.model.findUnique({
      where: { id: tcrComplianceId },
    })
    if (!record || record.campaignId !== campaignId) {
      this.logger.warn(
        { campaignId, tcrComplianceId },
        '[TCR Compliance] Kickoff for unknown or mismatched record; dropping',
      )
      return
    }

    const campaign = await this.campaignsService.findUnique({
      where: { id: campaignId },
      include: { user: true },
    })
    if (!campaign || !campaign.user) {
      this.logger.warn(
        { campaignId, tcrComplianceId },
        '[TCR Compliance] Kickoff for unknown campaign or user; dropping',
      )
      return
    }

    // campaign.details is a freeform JSON column; electionDate is typed as
    // `string?` in the shadow types but the Zod input schema doesn't enforce
    // YYYY-MM-DD. The agent uses this for {mm}/{month_abbreviation}/{yyyy}
    // placeholder expansion, so a wrong-format value (e.g. "11/02/2027" or
    // "November 2027") would feed malformed substrings into domain generation.
    // Reject at the boundary instead of letting it propagate.
    const electionDate = campaign.details.electionDate
    if (
      !electionDate ||
      !YYYY_MM_DD.test(electionDate) ||
      !isValid(parseISO(electionDate))
    ) {
      this.logger.error(
        { campaignId, tcrComplianceId, electionDate },
        '[TCR Compliance] Cannot dispatch compliance_setup: ' +
          'campaign.details.electionDate is missing or not a valid ' +
          'YYYY-MM-DD date',
      )
      await this.model.update({
        where: { id: tcrComplianceId },
        data: { status: TcrComplianceStatus.error },
      })
      return
    }

    // Atomic claim before dispatchRun to prevent duplicate dispatches under
    // at-least-once SQS delivery (consumer crashes, redelivery, concurrent
    // workers). Pattern mirrors the Peerly submission claim above. The claim
    // is keyed by agenticRunId being null (no successful dispatch yet) and
    // either no in-flight claim or a stale one past TTL.
    const staleBefore = subMinutes(
      new Date(),
      AGENTIC_DISPATCH_CLAIM_TTL_MINUTES,
    )
    const claimTimestamp = new Date()
    let isRecovery = false
    const claim = await this.model.updateMany({
      where: {
        id: tcrComplianceId,
        agenticRunId: null,
        OR: [
          { agenticDispatchAttemptedAt: null },
          { agenticDispatchAttemptedAt: { lt: staleBefore } },
        ],
      },
      data: { agenticDispatchAttemptedAt: claimTimestamp },
    })

    if (claim.count === 0) {
      // Idempotency branches intentionally exclude FAILED from the skip path.
      // Per gp-api/CLAUDE.md "Idempotency check breadth", FAILED runs must
      // remain eligible for re-dispatch — sweepStaleRuns flips RUNNING→FAILED
      // at 45min, and dispatchRun writes RUNNING then flips to FAILED on
      // SQS-send failure; including FAILED here would permanently strand both.
      const current = await this.model.findUnique({
        where: { id: tcrComplianceId },
      })
      if (!current) {
        return
      }
      if (current.agenticRunId) {
        const existingRun = await this.experimentRunsService.findUnique({
          where: { runId: current.agenticRunId },
        })
        if (
          existingRun &&
          (existingRun.status === ExperimentRunStatus.RUNNING ||
            existingRun.status === ExperimentRunStatus.COMPLETED)
        ) {
          this.logger.info(
            {
              tcrComplianceId,
              existingRunId: existingRun.runId,
              status: existingRun.status,
            },
            '[TCR Compliance] Agent run already dispatched for record; skipping',
          )
          return
        }
        if (existingRun?.status === ExperimentRunStatus.FAILED) {
          const retake = await this.model.updateMany({
            where: {
              id: tcrComplianceId,
              agenticRunId: current.agenticRunId,
            },
            data: {
              agenticRunId: null,
              agenticDispatchAttemptedAt: claimTimestamp,
            },
          })
          if (retake.count === 0) {
            this.logger.info(
              { tcrComplianceId },
              '[TCR Compliance] Lost race to re-dispatch FAILED run; skipping',
            )
            return
          }
          // Signal to the agent that this is a re-dispatch over a prior failure;
          // it will consult durable compliance state and skip completed steps
          // instead of restarting from step 1 (re-buying domain, etc.).
          isRecovery = true
        } else {
          // experiment_run row is missing — a concurrent worker is mid-dispatch
          // between its claim and ExperimentRunsService.dispatchRun creating
          // the experiment_run row. SQS will redeliver if that worker crashes
          // (claim TTL clears the slot in <=5min).
          this.logger.info(
            { tcrComplianceId, existingRunId: current.agenticRunId },
            '[TCR Compliance] Concurrent dispatch in progress; skipping',
          )
          return
        }
      } else {
        this.logger.info(
          { tcrComplianceId },
          '[TCR Compliance] Concurrent claim in progress; skipping',
        )
        return
      }
    }

    let run: ExperimentRun | undefined
    try {
      run = await this.experimentRunsService.dispatchRun({
        type: 'compliance_setup',
        organizationSlug: campaign.organizationSlug,
        clerkUserId,
        params: {
          campaign_id: campaignId,
          candidate_first_name: campaign.user.firstName ?? '',
          candidate_last_name: campaign.user.lastName ?? '',
          clerk_user_id: clerkUserId,
          election_date: electionDate,
          trigger: isRecovery ? 'recovery_resume' : 'initial',
        },
      })
    } catch (err) {
      // Roll back only this caller's claim by matching the exact timestamp we
      // wrote. A TTL re-claimant (caller B, after our call exceeded TTL) will
      // have a different timestamp, so its in-flight claim isn't disturbed.
      // agenticRunId: null guards against clearing a parallel success.
      await this.model.updateMany({
        where: {
          id: tcrComplianceId,
          agenticRunId: null,
          agenticDispatchAttemptedAt: claimTimestamp,
        },
        data: { agenticDispatchAttemptedAt: null },
      })
      throw err
    }

    if (!run) {
      // AGENT_DISPATCH_QUEUE_NAME is unset (preview envs by design — see
      // src/agentExperiments/CLAUDE.md). The misconfiguration is permanent
      // for the lifetime of this env, so retrying is futile. Roll back the
      // claim, log loudly, and ack so the message doesn't churn through
      // redrives until DLQ.
      await this.model.updateMany({
        where: {
          id: tcrComplianceId,
          agenticRunId: null,
          agenticDispatchAttemptedAt: claimTimestamp,
        },
        data: { agenticDispatchAttemptedAt: null },
      })
      this.logger.error(
        { campaignId, tcrComplianceId },
        '[TCR Compliance] Agent dispatch queue not configured; ' +
          'discarding kickoff message ' +
          '(set AGENT_DISPATCH_QUEUE_NAME to enable)',
      )
      return
    }

    // Stamp the runId scoped to our claim timestamp. If dispatchRun exceeded
    // the TTL and a re-claimant took over and stamped its own runId, this
    // updateMany matches zero rows — we don't clobber the live claim. The
    // orphaned experiment_run row this caller created is RUNNING; sweepStaleRuns
    // in ExperimentRunsService will flip it to FAILED at 45min.
    const stamped = await this.model.updateMany({
      where: {
        id: tcrComplianceId,
        agenticDispatchAttemptedAt: claimTimestamp,
      },
      data: { agenticRunId: run.runId },
    })

    if (stamped.count === 0) {
      this.logger.error(
        { campaignId, tcrComplianceId, runId: run.runId },
        '[TCR Compliance] Claim expired before dispatch completed; ' +
          'experiment_run is orphaned and will be FAILED by sweepStaleRuns',
      )
      return
    }

    this.logger.info(
      { campaignId, tcrComplianceId, runId: run.runId },
      '[TCR Compliance] Dispatched compliance_setup agent run',
    )
  }

  async delete(id: string) {
    return this.model.delete({
      where: { id },
    })
  }

  async checkTcrRegistrationStatus(peerlyIdentityId: string) {
    const { campaign } = await this.model.findFirstOrThrow({
      where: { peerlyIdentityId },
      include: {
        campaign: true,
      },
    })
    let useCases: PeerlyIdentityUseCase[]
    try {
      useCases =
        (await this.peerlyIdentityService.getIdentityUseCases(
          peerlyIdentityId,
          campaign,
        )) || []
    } catch (error) {
      if (error instanceof NotFoundException) {
        return false
      }
      throw error
    }

    const useCase = useCases.find(({ usecase }) => usecase === PEERLY_USECASE)
    return Boolean(useCase?.activated)
  }

  async getCvTokenStatus(peerlyIdentityId: string) {
    const { campaign } = await this.model.findFirstOrThrow({
      where: { peerlyIdentityId },
      include: {
        campaign: true,
      },
    })
    return await this.peerlyIdentityService.retrieveCampaignVerifyStatus(
      peerlyIdentityId,
      campaign,
    )
  }

  async retrieveCampaignVerifyToken(
    pin: string,
    { peerlyIdentityId }: TcrCompliance,
  ) {
    if (!peerlyIdentityId) {
      throw new BadRequestException(
        'TCR compliance does not have a Peerly identity ID',
      )
    }
    const { campaign } = await this.model.findFirstOrThrow({
      where: { peerlyIdentityId },
      include: {
        campaign: true,
      },
    })
    const pinIsValid = await this.peerlyIdentityService.verifyCampaignVerifyPin(
      peerlyIdentityId,
      pin,
      campaign,
    )
    if (!pinIsValid) {
      throw new UnprocessableEntityException('Invalid PIN')
    }

    return await this.peerlyIdentityService.createCampaignVerifyToken(
      peerlyIdentityId,
      campaign,
    )
  }

  async submitCampaignVerifyToken(
    tcrCompliance: TcrCompliance,
    campaignVerifyToken: string,
  ) {
    return this.peerlyIdentityService.approve10DLCBrand(
      tcrCompliance,
      campaignVerifyToken,
    )
  }
}
