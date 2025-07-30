import { BadRequestException, Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CreateTcrComplianceDto } from '../schemas/createTcrComplianceDto.schema'
import { PeerlyIdentityService } from '../../../peerly/services/peerlyIdentity.service'
import {
  Campaign,
  TcrCompliance,
  TcrComplianceStatus,
  User,
} from '@prisma/client'
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

    // TODO: Do whatever Peerly API dance is needed to start Campaign Verify
    //  process once we have those endpoints from Peerly

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
    // TODO: talk to Peerly service to retrieve the campaign verify token
    // This is a placeholder implementation. Replace with actual logic to retrieve the token.
    return (async (pin) =>
      Promise.resolve(
        `dummy-campaign-verify-token-${pin}-${peerlyIdentityId}`,
      ))(pin)
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

  async syncComplianceStatuses() {
    const compliances = await this.model.findMany({
      where: {
        status: TcrComplianceStatus.pending,
        peerlyIdentityId: { not: null },
      },
    })
    this.logger.debug('Sync Compliance Statuses:', compliances)
    for (const compliance of compliances) {
      const useCases = await this.peerlyIdentityService.getIdentityUseCases(
        compliance.peerlyIdentityId!,
      )
      this.logger.debug(
        `Use cases for compliance ID ${compliance.id}:`,
        useCases,
      )
    }
  }
}
