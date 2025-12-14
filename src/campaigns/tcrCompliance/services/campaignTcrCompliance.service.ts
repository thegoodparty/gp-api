import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import {
  Campaign,
  Prisma,
  TcrCompliance,
  TcrComplianceStatus,
  User,
} from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { QueueProducerService } from '../../../queue/producer/queueProducer.service'
import {
  QueueType,
  TcrComplianceStatusCheckMessage,
} from '../../../queue/queue.types'
import { getUserFullName } from '../../../users/util/users.util'
import {
  PeerlyGetCvRequestResponseBody,
  PeerlyIdentityProfile,
  PeerlyIdentityProfileResponseBody,
  PeerlyIdentityUseCase
} from '../../../vendors/peerly/peerly.types'
import { PEERLY_USECASE } from '../../../vendors/peerly/services/peerly.const'
import { PeerlyIdentityService } from '../../../vendors/peerly/services/peerlyIdentity.service'
import { WebsitesService } from '../../../websites/services/websites.service'
import { CreateTcrCompliancePayload } from '../campaignTcrCompliance.types'

const TCR_COMPLIANCE_CHECK_INTERVAL = process.env.TCR_COMPLIANCE_CHECK_INTERVAL
  ? parseInt(process.env.TCR_COMPLIANCE_CHECK_INTERVAL)
  : 12 * 60 * 60 // Defaults to 12 hrs

@Injectable()
export class CampaignTcrComplianceService extends createPrismaBase(
  MODELS.TcrCompliance,
) {
  constructor(
    private readonly peerlyIdentityService: PeerlyIdentityService,
    private readonly websitesService: WebsitesService,
    private queueService: QueueProducerService,
  ) {
    super()
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
        `Queuing up pendingTcrCompliances =>`,
        pendingTcrCompliances,
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

  /**
   * Creates a new TCR Compliance record and executes the Peerly registration flow.
   *
   * This method creates the TcrCompliance record FIRST (before any Peerly API calls)
   * to prevent race conditions and duplicate Peerly resources. All Peerly API calls
   * are then executed, and the record is updated once at the end with all Peerly data.
   *
   * If the record already exists:
   * - With 'error' status: Automatically retries the Peerly flow
   * - With any other status: Throws ConflictException
   *
   * This approach provides:
   * - Protection against duplicate Peerly resources (via DB unique constraint)
   * - Automatic retry capability for failed registrations
   * - Efficient single database update for all Peerly data
   * - Clear error handling and status tracking
   */
  async create(
    user: User,
    campaign: Campaign,
    tcrComplianceCreatePayload: CreateTcrCompliancePayload,
  ) {
    // STEP 1: Check if record already exists
    const existing = await this.fetchByCampaignId(campaign.id)

    if (existing) {
      // If exists with error status, allow retry
      if (existing.status === TcrComplianceStatus.error) {
        this.logger.debug(
          `Found existing TcrCompliance with error status, retrying...`,
        )
        return this.retryFailedCompliance(
          existing,
          user,
          campaign,
          tcrComplianceCreatePayload,
        )
      }

      // If exists and successful, throw error
      throw new ConflictException(
        `TCR compliance already exists for campaign ${campaign.id}`,
      )
    }

    const { ein, filingUrl, email } = tcrComplianceCreatePayload

    // STEP 2: Validate domain
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

    // STEP 3: Create DB record FIRST to claim this campaign and prevent race conditions
    let tcrCompliance: TcrCompliance

    try {
      tcrCompliance = await this.model.create({
        data: {
          ...tcrComplianceCreatePayload,
          postalAddress: campaign.formattedAddress!,
          campaignId: campaign.id,
          status: TcrComplianceStatus.submitted,
          // Peerly fields are null initially, will be populated after Peerly flow completes
          peerlyIdentityId: null,
          peerlyIdentityProfileLink: null,
          peerly10DLCBrandSubmissionKey: null,
        },
      })
      this.logger.debug(
        `TcrCompliance record created with ID: ${tcrCompliance.id}`,
      )
    } catch (error) {
      // Safety net: catch race condition if record created between check and create
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `TCR compliance already exists for campaign ${campaign.id}`,
        )
      }
      throw error
    }

    // STEP 4: Execute Peerly flow and update record
    return this.executePeerlyFlow(
      tcrCompliance,
      user,
      campaign,
      tcrComplianceCreatePayload,
      domain,
    )
  }

  /**
   * Retries the Peerly flow for a failed TCR compliance record.
   * Resets the status to 'submitted' and re-executes the Peerly flow.
   */
  private async retryFailedCompliance(
    tcrCompliance: TcrCompliance,
    user: User,
    campaign: Campaign,
    tcrComplianceCreatePayload: CreateTcrCompliancePayload,
  ) {
    const { domain } = await this.websitesService.findFirstOrThrow({
      where: { campaignId: campaign.id },
      include: { domain: true },
    })

    if (!domain) {
      throw new BadRequestException(
        'Campaign must have a domain to create TCR compliance',
      )
    }

    // Reset status to submitted before retrying
    tcrCompliance = await this.model.update({
      where: { id: tcrCompliance.id },
      data: { status: TcrComplianceStatus.submitted },
    })

    this.logger.debug(
      `Retrying Peerly flow for TcrCompliance ID: ${tcrCompliance.id}`,
    )

    return this.executePeerlyFlow(
      tcrCompliance,
      user,
      campaign,
      tcrComplianceCreatePayload,
      domain,
    )
  }

  /**
   * Executes the complete Peerly registration flow and updates the TCR compliance record.
   * This method is shared between create() and retryFailedCompliance() to follow DRY principles.
   *
   * The flow includes:
   * 1. Get or create Peerly Identity
   * 2. Get or submit Identity Profile
   * 3. Submit 10DLC Brand (if not already submitted)
   * 4. Submit Campaign Verify Request (if not already submitted)
   * 5. Update DB record with all Peerly data in a single operation
   *
   * If any step fails, the record is marked with 'error' status for later retry.
   */
  private async executePeerlyFlow(
    tcrCompliance: TcrCompliance,
    user: User,
    campaign: Campaign,
    tcrComplianceCreatePayload: CreateTcrCompliancePayload,
    domain: any,
  ) {
    const { ein, filingUrl, email } = tcrComplianceCreatePayload

    try {
      // Step 1: Get or create Peerly Identity
      const tcrIdentityName = this.peerlyIdentityService.getTCRIdentityName(
        getUserFullName(user),
        ein,
      )
      this.logger.debug(`tcrIdentityName => ${tcrIdentityName}`)

      const identities =
        await this.peerlyIdentityService.getIdentities(campaign)
      const existingIdentity = identities.find(
        (identity) => identity.identity_name === tcrIdentityName,
      )

      if (existingIdentity) {
        this.logger.debug('Existing Identity found, skipping creation')
      }
      this.logger.debug(
        `existingIdentity => ${JSON.stringify(existingIdentity)}`,
      )

      const tcrComplianceIdentity =
        existingIdentity ??
        (await this.peerlyIdentityService.createIdentity(
          tcrIdentityName,
          campaign,
        ))

      if (!tcrComplianceIdentity) {
        throw new Error('Failed to get or create TCR compliance identity')
      }

      // Step 2: Get or create Identity Profile
      let existingIdentityProfileResponse: PeerlyIdentityProfileResponseBody | null =
        null

      try {
        existingIdentityProfileResponse =
          await this.peerlyIdentityService.getIdentityProfile(
            tcrComplianceIdentity.identity_id,
            campaign,
          )
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error
        }
      }

      if (existingIdentityProfileResponse) {
        this.logger.debug('Existing Identity Profile found, skipping creation')
      }

      const peerlyIdentityProfileResponse =
        existingIdentityProfileResponse ??
        (await this.peerlyIdentityService.submitIdentityProfile(
          tcrComplianceIdentity.identity_id,
          campaign,
        ))

      if (!peerlyIdentityProfileResponse) {
        throw new Error('Failed to get or create identity profile')
      }

      const peerlyIdentityProfileLink =
        peerlyIdentityProfileResponse.link || null
      const identityProfile: PeerlyIdentityProfile | null =
        peerlyIdentityProfileResponse.profile || null

      // Step 3: Submit 10DLC Brand if needed
      let peerly10DLCBrandSubmissionKey: string | null = null

      // Apparently, duck-typing whether `vertical` has been set or not, is the
      // _only_ way to determine whether or not the given Identity has a 10DLC
      // "brand" submitted for it or not. See Peerly Slack discussion here:
      // https://goodpartyorg.slack.com/archives/C09H3K02LLV/p1759788426640679
      if (identityProfile?.vertical) {
        this.logger.debug(
          'Existing 10DLC Brand derived from IdentityProfile, skipping creation',
        )
      } else {
        peerly10DLCBrandSubmissionKey =
          (await this.peerlyIdentityService.submit10DlcBrand(
            tcrComplianceIdentity.identity_id,
            tcrComplianceCreatePayload,
            campaign,
            domain,
          )) || null
      }

      // Step 4: Submit Campaign Verify Request if needed
      let existingCampaignVerifyRequest: PeerlyGetCvRequestResponseBody | null =
        null

      try {
        existingCampaignVerifyRequest =
          await this.peerlyIdentityService.getCampaignVerifyRequest(
            tcrComplianceIdentity.identity_id,
            campaign,
          )
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error
        }
      }

      if (existingCampaignVerifyRequest?.verification_status) {
        this.logger.debug(
          `Existing Campaign Verify Request found w/ status ${existingCampaignVerifyRequest.verification_status}, skipping creation`,
        )
      } else {
        await this.peerlyIdentityService.submitCampaignVerifyRequest(
          {
            ein,
            filingUrl,
            peerlyIdentityId: tcrComplianceIdentity.identity_id,
            email,
          },
          user,
          campaign,
          domain,
        )
      }

      // Step 5: Update DB record with all Peerly data in ONE update for efficiency
      const updatedCompliance = await this.model.update({
        where: { id: tcrCompliance.id },
        data: {
          peerlyIdentityId: tcrComplianceIdentity.identity_id,
          peerlyIdentityProfileLink,
          peerly10DLCBrandSubmissionKey,
          status: TcrComplianceStatus.pending,
        },
      })

      this.logger.debug(
        'TCR Compliance created successfully:',
        updatedCompliance,
      )

      return updatedCompliance
    } catch (error) {
      // If Peerly calls fail, mark the record with error status for later retry
      this.logger.error(
        'Failed to create Peerly resources, marking as error',
        error,
      )

      await this.model.update({
        where: { id: tcrCompliance.id },
        data: { status: TcrComplianceStatus.error },
      })

      throw error
    }
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
    user: User,
    tcrCompliance: TcrCompliance,
    campaignVerifyToken: string,
  ) {
    return this.peerlyIdentityService.approve10DLCBrand(
      tcrCompliance,
      campaignVerifyToken,
    )
  }
}
