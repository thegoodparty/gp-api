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
import { getTCRIdentityName } from '../util/trcCompliance.util'
import { getUserFullName } from '../../../users/util/users.util'
import { WebsitesService } from '../../../websites/services/websites.service'
import { CreateTcrCompliancePayload } from '../campaignTcrCompliance.types'
import {
  PeerlyIdentity,
  PeerlyIdentityUseCase,
  PeerlySubmitCVResponseBody,
} from '../../../vendors/peerly/peerly.types'
import { PEERLY_USECASE } from '../../../vendors/peerly/services/peerly.const'
import { Interval, Timeout } from '@nestjs/schedule'
import { QueueProducerService } from '../../../queue/producer/queueProducer.service'
import {
  QueueType,
  TcrComplianceStatusCheckMessage,
} from '../../../queue/queue.types'
import { SlackService } from '../../../vendors/slack/services/slack.service'

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
    private readonly slackService: SlackService,
  ) {
    super()
  }

  @Timeout(0) // This will run immediately when the module is loaded
  @Interval(TCR_COMPLIANCE_CHECK_INTERVAL * 1000) // This will run based on the environment variable
  private async bootstrapTcrComplianceCheck() {
    const pendingTcrCompliances = await this.model.findMany({
      where: {
        status: TcrComplianceStatus.pending,
      },
    })
    this.logger.debug(
      `Queuing up pendingTcrCompliances =>`,
      pendingTcrCompliances,
    )
    if (pendingTcrCompliances.length) {
      await Promise.allSettled(
        pendingTcrCompliances.map((tcrCompliance) =>
          this.queueService.sendMessage({
            type: QueueType.TCR_COMPLIANCE_STATUS_CHECK,
            data: { tcrCompliance } as TcrComplianceStatusCheckMessage,
          }),
        ),
      )
    }
  }

  async fetchByCampaignId(campaignId: number) {
    return this.model.findUnique({
      where: { campaignId },
    })
  }

  private async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    errorContext: string,
  ): Promise<T> {
    try {
      return await operation()
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : `An unknown error occurred while ${errorContext}`
      this.logger.error(`Failed to ${errorContext}: ${errorMessage}`)
      throw error
    }
  }

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
    let tcrComplianceIdentity: PeerlyIdentity | null = null,
      peerlyIdentityProfileLink: string | null = null,
      peerly10DLCBrandSubmissionKey: string | null = null,
      campaignVerifySubmissionData: PeerlySubmitCVResponseBody | null = null

    const tcrIdentityName = getTCRIdentityName(getUserFullName(user!), ein)

    tcrComplianceIdentity = await this.executeWithErrorHandling(
      () => this.peerlyIdentityService.createIdentity(tcrIdentityName),
      'create TCR identity',
    )

    peerlyIdentityProfileLink = await this.executeWithErrorHandling(
      () =>
        this.peerlyIdentityService.submitIdentityProfile(
          tcrComplianceIdentity.identity_id,
        ),
      'submit identity profile',
    )

    peerly10DLCBrandSubmissionKey = await this.executeWithErrorHandling(
      () =>
        this.peerlyIdentityService.submit10DlcBrand(
          tcrComplianceIdentity.identity_id,
          tcrComplianceCreatePayload,
          campaign,
          domain,
        ),
      'submit 10DLC brand',
    )

    campaignVerifySubmissionData = await this.executeWithErrorHandling(
      () =>
        this.peerlyIdentityService.submitCampaignVerifyRequest(
          {
            ein,
            filingUrl,
            peerlyIdentityId: tcrComplianceIdentity.identity_id,
            email,
          },
          user,
          campaign,
          domain!,
        ),
      'submit campaign verify request',
    )

    const newTcrCompliance = {
      ...tcrComplianceCreatePayload,
      postalAddress: campaign.formattedAddress!,
      campaignId: campaign.id,
      peerlyIdentityId: tcrComplianceIdentity.identity_id,
      peerlyIdentityProfileLink,
      peerly10DLCBrandSubmissionKey,
      peerlyCvVerificationId: campaignVerifySubmissionData?.verification_id,
    }

    this.logger.debug('Creating TCR Compliance:', newTcrCompliance)

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
    let useCases: PeerlyIdentityUseCase[]
    try {
      useCases =
        await this.peerlyIdentityService.getIdentityUseCases(peerlyIdentityId)
    } catch (error) {
      if (error instanceof NotFoundException) {
        return false
      }
      throw error
    }

    const useCase = useCases.find(({ usecase }) => usecase === PEERLY_USECASE)
    return Boolean(useCase?.activated)
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
    const pinIsValid = await this.peerlyIdentityService.verifyCampaignVerifyPin(
      peerlyIdentityId,
      pin,
    )
    if (!pinIsValid) {
      throw new UnprocessableEntityException('Invalid PIN')
    }

    return await this.peerlyIdentityService.createCampaignVerifyToken(
      peerlyIdentityId,
    )
  }

  async submitCampaignVerifyToken(
    user: User,
    tcrCompliance: TcrCompliance,
    campaignVerifyToken: string,
  ) {
    return this.peerlyIdentityService.approve10DLCBrand(
      user,
      tcrCompliance,
      campaignVerifyToken,
    )
  }
}
