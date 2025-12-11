import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { PeerlyIdentityService } from '../../../vendors/peerly/services/peerlyIdentity.service'
import {
  Campaign,
  TcrCompliance,
  TcrComplianceStatus,
  User,
} from '@prisma/client'
import { getUserFullName } from '../../../users/util/users.util'
import { WebsitesService } from '../../../websites/services/websites.service'
import { CreateTcrCompliancePayload } from '../campaignTcrCompliance.types'
import {
  PeerlyIdentityProfileResponseBody,
  PeerlyIdentity,
  PeerlyIdentityProfile,
  PeerlyIdentityUseCase,
  PeerlyGetCvRequestResponseBody,
} from '../../../vendors/peerly/peerly.types'
import { PEERLY_USECASE } from '../../../vendors/peerly/services/peerly.const'
import { Interval } from '@nestjs/schedule'
import { QueueProducerService } from '../../../queue/producer/queueProducer.service'
import {
  QueueType,
  TcrComplianceStatusCheckMessage,
} from '../../../queue/queue.types'

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
   * Creates or resumes a TCR Compliance record and executes the Peerly registration flow.
   * Creates the record first, then progressively updates it as each Peerly step completes.
   */
  async create(
    user: User,
    campaign: Campaign,
    tcrComplianceCreatePayload: CreateTcrCompliancePayload,
  ) {
    const { ein, filingUrl, email } = tcrComplianceCreatePayload
    const userFullName = getUserFullName(user!)
    const { ballotLevel } = campaign.details as { ballotLevel?: string }

    this.logger.log(
      `[TCR Compliance] Starting create/resume flow for ` +
        `campaignId=${campaign.id}, userId=${user.id}, userName="${userFullName}", ` +
        `ein=${ein}, ballotLevel=${ballotLevel || 'NOT_SET'}`,
    )

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

    let tcrCompliance = await this.fetchByCampaignId(campaign.id)

    if (!tcrCompliance) {
      this.logger.debug(
        `[TCR Compliance] Step 1: Creating TcrCompliance record for campaignId=${campaign.id}`,
      )
      tcrCompliance = await this.model.create({
        data: {
          ...tcrComplianceCreatePayload,
          postalAddress: campaign.formattedAddress!,
          campaignId: campaign.id,
        },
      })
      this.logger.debug(
        `TcrCompliance record created with ID: ${tcrCompliance.id}`,
      )
    } else {
      this.logger.debug(
        `[TCR Compliance] Step 1: Existing TcrCompliance record found with ID: ${tcrCompliance.id}, resuming Peerly flow`,
      )

      if (tcrCompliance.ein !== ein) {
        this.logger.warn(
          `[TCR Compliance] EIN MISMATCH DETECTED for campaignId=${campaign.id}! ` +
            `Stored EIN: ${tcrCompliance.ein}, New EIN: ${ein}. ` +
            `This could create duplicate Peerly identities if peerlyIdentityId is not set.`,
        )
      }
    }

    let tcrComplianceIdentity: PeerlyIdentity | null = null
    let peerlyIdentityProfileLink: string | null =
      tcrCompliance.peerlyIdentityProfileLink
    let peerly10DLCBrandSubmissionKey: string | null =
      tcrCompliance.peerly10DLCBrandSubmissionKey

    const tcrIdentityName = this.peerlyIdentityService.getTCRIdentityName(
      getUserFullName(user!),
      ein,
    )
    this.logger.debug(`tcrIdentityName => ${tcrIdentityName}`)

    if (!tcrCompliance.peerlyIdentityId) {
      this.logger.debug(
        `[TCR Compliance] Step 2: Searching for Peerly identity: ${tcrIdentityName}`,
      )
      const identities =
        await this.peerlyIdentityService.getIdentities(campaign)

      let existingIdentity = identities.find(
        (identity) => identity.identity_name === tcrIdentityName,
      )

      // Also check for identity with stored EIN to prevent duplicates on EIN change
      if (!existingIdentity && tcrCompliance.ein && tcrCompliance.ein !== ein) {
        const storedEinIdentityName =
          this.peerlyIdentityService.getTCRIdentityName(
            getUserFullName(user!),
            tcrCompliance.ein,
          )
        existingIdentity = identities.find(
          (identity) => identity.identity_name === storedEinIdentityName,
        )
        if (existingIdentity) {
          this.logger.warn(
            `[TCR Compliance] Found existing identity with STORED EIN (${tcrCompliance.ein}) ` +
              `instead of NEW EIN (${ein}). Using existing identity to prevent duplicate.`,
          )
        }
      }

      if (existingIdentity) {
        this.logger.debug(
          `[TCR Compliance] Step 2: Existing Identity found, skipping creation: ${JSON.stringify(existingIdentity)}`,
        )
      }

      tcrComplianceIdentity =
        existingIdentity ||
        (await this.peerlyIdentityService.createIdentity(
          tcrIdentityName,
          campaign,
        )) ||
        null

      if (tcrComplianceIdentity) {
        tcrCompliance = await this.model.update({
          where: { id: tcrCompliance.id },
          data: { peerlyIdentityId: tcrComplianceIdentity.identity_id },
        })
        this.logger.debug(
          `TcrCompliance updated with peerlyIdentityId: ${tcrComplianceIdentity.identity_id}`,
        )
      }
    } else {
      this.logger.debug(
        `Using existing peerlyIdentityId: ${tcrCompliance.peerlyIdentityId}`,
      )
      tcrComplianceIdentity = {
        identity_id: tcrCompliance.peerlyIdentityId,
        identity_name: tcrIdentityName,
      } as PeerlyIdentity
    }

    if (!tcrComplianceIdentity) {
      throw new BadRequestException('Failed to get or create Peerly identity')
    }

    let existingIdentityProfileResponse: PeerlyIdentityProfileResponseBody | null =
      null
    try {
      existingIdentityProfileResponse =
        await this.peerlyIdentityService.getIdentityProfile(
          tcrComplianceIdentity.identity_id,
          campaign,
        )
    } catch (error) {
      if (error instanceof NotFoundException) {
        existingIdentityProfileResponse = null
      } else {
        throw error
      }
    }

    existingIdentityProfileResponse &&
      this.logger.debug(`Existing Identity Profile found, skipping creation`)

    const peerlyIdentityProfileResponse: PeerlyIdentityProfileResponseBody | null =
      existingIdentityProfileResponse ||
      (await this.peerlyIdentityService.submitIdentityProfile(
        tcrComplianceIdentity.identity_id,
        campaign,
      )) ||
      null

    if (
      peerlyIdentityProfileResponse?.link &&
      !tcrCompliance.peerlyIdentityProfileLink
    ) {
      peerlyIdentityProfileLink = peerlyIdentityProfileResponse.link
      tcrCompliance = await this.model.update({
        where: { id: tcrCompliance.id },
        data: { peerlyIdentityProfileLink },
      })
      this.logger.debug(
        `TcrCompliance updated with peerlyIdentityProfileLink: ${peerlyIdentityProfileLink}`,
      )
    }

    const identityProfile: PeerlyIdentityProfile | null =
      peerlyIdentityProfileResponse?.profile
        ? peerlyIdentityProfileResponse?.profile
        : null

    // Duck-typing `vertical` is the only way to determine if 10DLC brand was submitted
    // See: https://goodpartyorg.slack.com/archives/C09H3K02LLV/p1759788426640679
    if (
      !identityProfile?.vertical &&
      !tcrCompliance.peerly10DLCBrandSubmissionKey
    ) {
      identityProfile?.vertical &&
        this.logger.debug(
          `Existing 10DLC Brand derived from IdentityProfile, skipping creation`,
        )

      peerly10DLCBrandSubmissionKey =
        (await this.peerlyIdentityService.submit10DlcBrand(
          tcrComplianceIdentity.identity_id,
          tcrComplianceCreatePayload,
          campaign,
          domain,
        )) || null

      if (peerly10DLCBrandSubmissionKey) {
        tcrCompliance = await this.model.update({
          where: { id: tcrCompliance.id },
          data: { peerly10DLCBrandSubmissionKey },
        })
        this.logger.debug(
          `TcrCompliance updated with peerly10DLCBrandSubmissionKey: ${peerly10DLCBrandSubmissionKey}`,
        )
      }
    } else {
      this.logger.debug(
        `10DLC Brand already submitted, skipping (vertical: ${identityProfile?.vertical}, submissionKey: ${tcrCompliance.peerly10DLCBrandSubmissionKey})`,
      )
    }

    let existingCampaignVerifyRequest: PeerlyGetCvRequestResponseBody | null =
      null
    try {
      existingCampaignVerifyRequest =
        await this.peerlyIdentityService.getCampaignVerifyRequest(
          tcrComplianceIdentity.identity_id,
          campaign,
        )
    } catch (error) {
      if (error instanceof NotFoundException) {
        existingCampaignVerifyRequest = null
      } else {
        throw error
      }
    }

    existingCampaignVerifyRequest?.verification_status &&
      this.logger.debug(
        `Existing Campaign Verify Request found w/ status ${existingCampaignVerifyRequest?.verification_status}, skipping creation`,
      )

    if (!existingCampaignVerifyRequest?.verification_status) {
      this.logger.debug(
        `[TCR Compliance] Step 5: Submitting Campaign Verify Request for campaignId=${campaign.id}`,
      )
      await this.peerlyIdentityService.submitCampaignVerifyRequest(
        {
          ein,
          filingUrl,
          peerlyIdentityId: tcrComplianceIdentity.identity_id,
          email,
        },
        user,
        campaign,
        domain!,
      )
      this.logger.log(
        `[TCR Compliance] Step 5 SUCCESS: Campaign Verify Request submitted for campaignId=${campaign.id}`,
      )
    } else {
      this.logger.debug(
        `[TCR Compliance] Step 5: Skipping CV Request submission (existing status: ${existingCampaignVerifyRequest?.verification_status})`,
      )
    }

    this.logger.log(
      `[TCR Compliance] Flow completed for campaignId=${campaign.id}, ` +
        `tcrComplianceId=${tcrCompliance.id}, peerlyIdentityId=${tcrCompliance.peerlyIdentityId}`,
    )

    return tcrCompliance
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
