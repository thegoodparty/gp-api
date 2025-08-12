import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CreateTcrComplianceDto } from '../schemas/createTcrComplianceDto.schema'
import { PeerlyIdentityService } from '../../../peerly/services/peerlyIdentity.service'
import { Campaign, TcrCompliance, User } from '@prisma/client'
import { getTCRIdentityName } from '../util/trcCompliance.util'
import { getUserFullName } from '../../../users/util/users.util'

@Injectable()
export class CampaignTcrComplianceService extends createPrismaBase(
  MODELS.TcrCompliance,
) {
  constructor(private readonly peerlyIdentityService: PeerlyIdentityService) {
    super()
  }

  async fetchByCampaignId(campaignId: number) {
    return this.model.findUnique({
      where: { campaignId },
    })
  }

  async create(
    user: User,
    campaign: Campaign,
    tcrComplianceDto: CreateTcrComplianceDto,
  ) {
    const { ein, filingUrl, email } = tcrComplianceDto
    const tcrIdentityName = getTCRIdentityName(getUserFullName(user!), ein)
    const tcrComplianceIdentity =
      await this.peerlyIdentityService.createIdentity(tcrIdentityName)

    const peerlyIdentityProfileLink =
      await this.peerlyIdentityService.submitIdentityProfile(
        tcrComplianceIdentity.identity_id,
      )

    const peerly10DLCBrandSubmissionKey =
      await this.peerlyIdentityService.submit10DlcBrand(
        tcrComplianceIdentity.identity_id,
        tcrComplianceDto,
        campaign,
      )

    const campaignVerifySubmissionData =
      await this.peerlyIdentityService.submitCampaignVerifyRequest(
        {
          ein,
          filingUrl,
          peerlyIdentityId: tcrComplianceIdentity.identity_id,
          email,
        },
        user,
        campaign,
      )

    // TODO: Do whatever Peerly API dance is needed to start Campaign Verify
    //  process once we have those endpoints from Peerly

    const newTcrCompliance = {
      ...tcrComplianceDto,
      postalAddress: campaign.formattedAddress!,
      campaignId: campaign.id,
      peerlyIdentityId: tcrComplianceIdentity.identity_id,
      peerlyIdentityProfileLink,
      peerly10DLCBrandSubmissionKey,
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

  async retrieveCampaignVerifyToken(
    pin: number,
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
