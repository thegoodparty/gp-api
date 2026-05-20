import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { subMinutes } from 'date-fns'
import {
  Campaign,
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
import { SubmitToPeerlyOutput } from '@goodparty_org/contracts'

const TCR_COMPLIANCE_CHECK_INTERVAL = process.env.TCR_COMPLIANCE_CHECK_INTERVAL
  ? parseInt(process.env.TCR_COMPLIANCE_CHECK_INTERVAL)
  : 12 * 60 * 60 // Defaults to 12 hrs

const AGENTIC_KICKOFF_SWEEP_INTERVAL = process.env
  .AGENTIC_KICKOFF_SWEEP_INTERVAL
  ? parseInt(process.env.AGENTIC_KICKOFF_SWEEP_INTERVAL)
  : 10 * 60

const AGENTIC_KICKOFF_STALENESS_MINUTES = 10

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
  ): Promise<{
    peerlyIdentityId: string
    peerlyIdentityProfileLink: string | null
    peerly10DLCBrandSubmissionKey: string | null
    cvVerificationId: string | null
  }> {
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

    const pinDeliveryChannels = { email: input.email, phone: input.phone }

    if (existing.peerlyIdentityId) {
      this.logger.info(
        `[TCR Compliance] submitToPeerlyForAgent idempotent return for ` +
          `campaignId=${campaign.id}, ` +
          `peerlyIdentityId=${existing.peerlyIdentityId}`,
      )
      const state = await this.complianceStateService.findStateForCampaign(
        campaign.id,
      )
      return {
        tcrComplianceId: existing.id,
        peerlyIdentityId: existing.peerlyIdentityId,
        peerlyIdentityProfileLink: existing.peerlyIdentityProfileLink,
        peerly10DLCBrandSubmissionKey: existing.peerly10DLCBrandSubmissionKey,
        peerlyVerificationId: existing.peerlyCvVerificationId,
        stage: state.stage,
        pinDeliveryChannels,
      }
    }

    const hostname = new URL(input.websiteUrl).hostname

    const { websiteUrl, ...rest } = input
    const helperPayload: CreateTcrCompliancePayload = {
      ...rest,
      websiteDomain: websiteUrl,
    }

    const peerlyResult = await this.submitToPeerly(
      user,
      campaign,
      helperPayload,
      hostname,
    )

    // Race-safety: only land the write if peerlyIdentityId is still null.
    // Combined with the helper's per-step Peerly de-dup by identity name,
    // this keeps DB state consistent under overlapping retries.
    const claim = await this.model.updateMany({
      where: { id: existing.id, peerlyIdentityId: null },
      data: {
        ein: input.ein,
        committeeName: input.committeeName,
        filingUrl: input.filingUrl,
        email: input.email,
        phone: input.phone,
        officeLevel: input.officeLevel,
        fecCommitteeId: input.fecCommitteeId ?? null,
        committeeType: input.committeeType,
        websiteDomain: input.websiteUrl,
        postalAddress: campaign.formattedAddress ?? existing.postalAddress,
        peerlyIdentityId: peerlyResult.peerlyIdentityId,
        peerlyIdentityProfileLink: peerlyResult.peerlyIdentityProfileLink,
        peerly10DLCBrandSubmissionKey:
          peerlyResult.peerly10DLCBrandSubmissionKey,
        peerlyCvVerificationId: peerlyResult.cvVerificationId,
      },
    })

    if (claim.count === 0) {
      const winner = await this.fetchByCampaignId(campaign.id)
      if (!winner) {
        throw new NotFoundException(
          `TcrCompliance record vanished mid-flight for ` +
            `campaignId=${campaign.id}`,
        )
      }
      const winnerState =
        await this.complianceStateService.findStateForCampaign(campaign.id)
      this.logger.info(
        `[TCR Compliance] submitToPeerlyForAgent lost write race for ` +
          `campaignId=${campaign.id}; returning record persisted by ` +
          `parallel call (peerlyIdentityId=${winner.peerlyIdentityId})`,
      )
      return {
        tcrComplianceId: winner.id,
        peerlyIdentityId:
          winner.peerlyIdentityId ?? peerlyResult.peerlyIdentityId,
        peerlyIdentityProfileLink: winner.peerlyIdentityProfileLink,
        peerly10DLCBrandSubmissionKey: winner.peerly10DLCBrandSubmissionKey,
        peerlyVerificationId: winner.peerlyCvVerificationId,
        stage: winnerState.stage,
        pinDeliveryChannels,
      }
    }

    const updated = await this.model.findUniqueOrThrow({
      where: { id: existing.id },
    })

    const state = await this.complianceStateService.findStateForCampaign(
      campaign.id,
    )

    this.logger.info(
      `[TCR Compliance] submitToPeerlyForAgent complete for ` +
        `campaignId=${campaign.id}, tcrComplianceId=${updated.id}, ` +
        `peerlyIdentityId=${updated.peerlyIdentityId}, stage=${state.stage}`,
    )

    return {
      tcrComplianceId: updated.id,
      peerlyIdentityId: peerlyResult.peerlyIdentityId,
      peerlyIdentityProfileLink: peerlyResult.peerlyIdentityProfileLink,
      peerly10DLCBrandSubmissionKey: peerlyResult.peerly10DLCBrandSubmissionKey,
      peerlyVerificationId: peerlyResult.cvVerificationId,
      stage: state.stage,
      pinDeliveryChannels,
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
