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
      this.logger.debug(`Queuing up pendingTcrCompliances =>`, {
        pendingTcrCompliances,
      })
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
    const { ein, filingUrl, email } = tcrComplianceCreatePayload

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
    let identities: PeerlyIdentity[] = [],
      tcrComplianceIdentity: PeerlyIdentity | null = null,
      peerlyIdentityProfileLink: string | null = null,
      peerly10DLCBrandSubmissionKey: string | null = null

    const tcrIdentityName = this.peerlyIdentityService.getTCRIdentityName(
      getUserFullName(user!),
      ein,
    )
    this.logger.debug(`tcrIdentityName => ${tcrIdentityName}`)

    identities = await this.peerlyIdentityService.getIdentities(campaign)
    const existingIdentity = identities.find(
      (identity) => identity.identity_name === tcrIdentityName,
    )

    existingIdentity &&
      this.logger.debug(`Existing Identity found, skipping creation`)
    this.logger.debug(`existingIdentity`, { existingIdentity })

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

    existingIdentityProfileResponse &&
      this.logger.debug(`Existing Identity Profile found, skipping creation`)

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

    // Apparently,  duck-typing whether `vertical` has been set or not, is the
    //  _only_ way to determine whether or not the given Identity has a 10DLC
    //  "brand" submitted for it or not. See Peerly Slack discussion here:
    //  https://goodpartyorg.slack.com/archives/C09H3K02LLV/p1759788426640679
    identityProfile?.vertical &&
      this.logger.debug(
        `Existing 10DLC Brand derived from IdentityProfile, skipping creation`,
      )
    if (!identityProfile?.vertical) {
      peerly10DLCBrandSubmissionKey =
        (await this.peerlyIdentityService.submit10DlcBrand(
          tcrComplianceIdentity!.identity_id,
          tcrComplianceCreatePayload,
          campaign,
          domain,
        )) || null
    }

    let existingCampaignVerifyRequest: PeerlyGetCvRequestResponseBody | null =
      null
    try {
      existingCampaignVerifyRequest =
        await this.peerlyIdentityService.getCampaignVerifyRequest(
          tcrComplianceIdentity!.identity_id,
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

    !existingCampaignVerifyRequest?.verification_status &&
      (await this.peerlyIdentityService.submitCampaignVerifyRequest(
        {
          ein,
          filingUrl,
          peerlyIdentityId: tcrComplianceIdentity!.identity_id,
          email,
        },
        user,
        campaign,
        domain!,
      ))

    const newTcrCompliance = {
      ...tcrComplianceCreatePayload,
      postalAddress: campaign.formattedAddress!,
      campaignId: campaign.id,
      peerlyIdentityId: tcrComplianceIdentity!.identity_id,
      peerlyIdentityProfileLink,
      peerly10DLCBrandSubmissionKey,
    }

    this.logger.debug('Creating TCR Compliance:', { newTcrCompliance })

    return this.model.create({
      data: newTcrCompliance,
    })
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
