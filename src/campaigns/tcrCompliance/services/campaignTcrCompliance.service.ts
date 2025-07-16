import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CreateTcrComplianceDto } from '../schemas/campaignTcrCompliance.schema'
import { PeerlyIdentityService } from '../../../peerly/services/peerlyIdentity.service'
import { Campaign, User } from '@prisma/client'
import { getTCRIdentityName } from '../util/trcCompliance.util'
import { getUserFullName } from '../../../users/util/users.util'
import { postalAddressToString } from '../../../shared/util/postalAddresses.util'

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
    tcrCompliance: CreateTcrComplianceDto,
  ) {
    const tcrIdentityName = getTCRIdentityName(
      getUserFullName(user!),
      tcrCompliance.ein,
    )
    const tcrComplianceIdentity =
      await this.peerlyIdentityService.createIdentity(tcrIdentityName)

    const peerlyIdentityProfileLink =
      await this.peerlyIdentityService.submitIdentityProfile(
        tcrComplianceIdentity.identity_id,
      )

    const peerly10DLCBrandSubmissionKey =
      await this.peerlyIdentityService.submit10DlcBrand(
        tcrComplianceIdentity.identity_id,
        tcrCompliance,
        campaign,
      )

    const newTcrCompliance = {
      ...tcrCompliance,
      postalAddress: postalAddressToString(tcrCompliance.postalAddress),
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

  async delete(campaignId: number) {
    return this.model.delete({
      where: { campaignId },
    })
  }
}
