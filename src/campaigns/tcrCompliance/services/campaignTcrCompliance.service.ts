import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CreateTcrComplianceDto } from '../schemas/campaignTcrCompliance.schema'
import { PeerlyIdentityService } from '../../../peerly/services/peerlyIdentity.service'
import { Campaign, User } from '@prisma/client'
import { getTCRIdentityName } from '../util/trcCompliance.util'
import { getUserFullName } from '../../../users/util/users.util'

@Injectable()
export class CampaignTcrComplianceService extends createPrismaBase(
  MODELS.TcrCompliance,
) {
  constructor(private readonly peerlyIdentityService: PeerlyIdentityService) {
    super()
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

    const newTcrCompliance = {
      ...tcrCompliance,
      campaignId: campaign.id,
      peerlyIdentityId: tcrComplianceIdentity.identity_id,
    }

    this.logger.debug('Creating TCR Compliance:', newTcrCompliance)

    return this.model.create({
      data: newTcrCompliance,
    })
  }
}
