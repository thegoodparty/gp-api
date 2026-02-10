import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import {
  Campaign,
  TcrCompliance,
  TcrComplianceStatus,
  User,
} from '@prisma/client'
import { IS_PROD } from 'src/shared/util/appEnvironment.util'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { QueueProducerService } from '../../../queue/producer/queueProducer.service'
import {
  QueueType,
  TcrComplianceStatusCheckMessage,
} from '../../../queue/queue.types'
import { getUserFullName } from '../../../users/util/users.util'
import {
  PeerlyIdentity,
  PeerlyIdentityProfile,
  PeerlyIdentityProfileResponseBody,
  PeerlyIdentityUseCase,
} from '../../../vendors/peerly/peerly.types'
import { PEERLY_USECASE } from '../../../vendors/peerly/services/peerly.const'
import { PeerlyIdentityService } from '../../../vendors/peerly/services/peerlyIdentity.service'
import { WebsitesService } from '../../../websites/services/websites.service'
import { CreateTcrCompliancePayload } from '../campaignTcrCompliance.types'

const TCR_COMPLIANCE_CHECK_INTERVAL = process.env.TCR_COMPLIANCE_CHECK_INTERVAL
  ? parseInt(process.env.TCR_COMPLIANCE_CHECK_INTERVAL)
  : 12 * 60 * 60 // Defaults to 12 hrs

/** When set (non-production only), this PIN skips real Peerly CV calls (for local/dev testing). */
const PEERLY_CV_BYPASS_PIN = process.env.PEERLY_CV_BYPASS_PIN

/** Bypass is only allowed when PIN is set and we are not in production. */
const CV_BYPASS_ALLOWED = Boolean(PEERLY_CV_BYPASS_PIN) && !IS_PROD

const CV_BYPASS_TOKEN = 'LOCAL_CV_BYPASS'

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
    if (PEERLY_CV_BYPASS_PIN && IS_PROD) {
      this.logger.warn(
        'PEERLY_CV_BYPASS_PIN is set in production; bypass is disabled. Remove the env var in production.',
      )
    } else if (CV_BYPASS_ALLOWED) {
      this.logger.warn(
        'PEERLY_CV_BYPASS_PIN is set: Campaign Verify bypass is ENABLED for this environment (non-production only).',
      )
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
    const {
      ein,
      filingUrl,
      email,
      officeLevel,
      fecCommitteeId,
      committeeType,
    } = tcrComplianceCreatePayload

    const userFullName = getUserFullName(user!)
    const { ballotLevel } = campaign.details as { ballotLevel?: string }

    this.logger.log(
      `[TCR Compliance] Starting registration flow for ` +
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
    let tcrComplianceIdentity: PeerlyIdentity | null = null,
      peerlyIdentityProfileLink: string | null = null,
      peerly10DLCBrandSubmissionKey: string | null = null

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
        `[TCR Compliance] Step 1: Existing Identity found, skipping creation: ${JSON.stringify(existingIdentity)}`,
      )
    } else {
      this.logger.debug(
        `[TCR Compliance] Step 1: No existing identity found, creating new one`,
      )
    }

    tcrComplianceIdentity =
      existingIdentity ||
      (await this.peerlyIdentityService.createIdentity(
        tcrIdentityName,
        campaign,
      )) ||
      null

    let existingIdentityProfileResponse: PeerlyIdentityProfileResponseBody | null =
      null
    try {
      existingIdentityProfileResponse =
        await this.peerlyIdentityService.getIdentityProfile(
          tcrComplianceIdentity!.identity_id,
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
        tcrComplianceIdentity!.identity_id,
        campaign,
      )) ||
      null

    peerlyIdentityProfileLink = peerlyIdentityProfileResponse?.link || null

    const identityProfile: PeerlyIdentityProfile | null =
      peerlyIdentityProfileResponse?.profile
        ? peerlyIdentityProfileResponse?.profile
        : null

    // Apparently, duck-typing whether `vertical` has been set or not, is the
    //  _only_ way to determine whether or not the given Identity has a 10DLC
    //  "brand" submitted for it or not. See Peerly Slack discussion here:
    //  https://goodpartyorg.slack.com/archives/C09H3K02LLV/p1759788426640679
    if (identityProfile?.vertical) {
      this.logger.debug(
        `[TCR Compliance] Step 3: Existing 10DLC Brand derived from IdentityProfile (vertical=${identityProfile.vertical}), skipping creation`,
      )
    } else {
      this.logger.debug(`[TCR Compliance] Step 3: Submitting 10DLC Brand`)
      peerly10DLCBrandSubmissionKey =
        (await this.peerlyIdentityService.submit10DlcBrand(
          tcrComplianceIdentity!.identity_id,
          tcrComplianceCreatePayload,
          campaign,
          domain,
        )) || null
    }

    const existingCampaignVerifyRequest =
      await this.peerlyIdentityService.getCampaignVerifyRequest(
        tcrComplianceIdentity!.identity_id,
        campaign,
      )

    if (existingCampaignVerifyRequest?.verification_status) {
      this.logger.debug(
        `[TCR Compliance] Step 4: Existing Campaign Verify Request found w/ status ${existingCampaignVerifyRequest?.verification_status}, skipping creation`,
      )
    } else {
      this.logger.debug(
        `[TCR Compliance] Step 4: Submitting Campaign Verify Request for campaignId=${campaign.id}`,
      )

      await this.peerlyIdentityService.submitCampaignVerifyRequest(
        {
          ein,
          filingUrl,
          peerlyIdentityId: tcrComplianceIdentity!.identity_id,
          email,
          officeLevel,
          fecCommitteeId: fecCommitteeId ?? null,
          committeeType: committeeType,
        },
        user,
        campaign,
        domain!,
      )
      this.logger.log(
        `[TCR Compliance] Step 4 SUCCESS: Campaign Verify Request submitted for campaignId=${campaign.id}`,
      )
    }

    const newTcrCompliance = {
      ...tcrComplianceCreatePayload,
      postalAddress: campaign.formattedAddress!,
      campaignId: campaign.id,
      peerlyIdentityId: tcrComplianceIdentity!.identity_id,
      peerlyIdentityProfileLink,
      peerly10DLCBrandSubmissionKey,
    }

    this.logger.debug(
      `[TCR Compliance] Step 5: Creating TCR Compliance record: ${JSON.stringify(newTcrCompliance)}`,
    )

    const createdTcrCompliance = await this.model.create({
      data: newTcrCompliance,
    })

    this.logger.log(
      `[TCR Compliance] Flow completed for campaignId=${campaign.id}, ` +
        `tcrComplianceId=${createdTcrCompliance.id}, peerlyIdentityId=${createdTcrCompliance.peerlyIdentityId}`,
    )

    return createdTcrCompliance
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

    if (CV_BYPASS_ALLOWED && pin === PEERLY_CV_BYPASS_PIN) {
      this.logger.warn(
        'PEERLY_CV_BYPASS_PIN used: Campaign Verify bypassed; 10DLC will auto-approve. Only use in non-production.',
      )
      return CV_BYPASS_TOKEN
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
    // Only treat bypass token as special when the feature is enabled (defense-in-depth)
    if (campaignVerifyToken === CV_BYPASS_TOKEN && PEERLY_CV_BYPASS_PIN) {
      if (CV_BYPASS_ALLOWED) {
        return { status: 'approved', displayName: 'Local bypass' } as Awaited<
          ReturnType<PeerlyIdentityService['approve10DLCBrand']>
        >
      }
      throw new UnprocessableEntityException(
        'Campaign Verify bypass is not allowed in production',
      )
    }
    return this.peerlyIdentityService.approve10DLCBrand(
      tcrCompliance,
      campaignVerifyToken,
    )
  }
}
