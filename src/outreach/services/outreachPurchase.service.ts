import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common'
import { PurchaseHandler, PurchaseMetadata } from 'src/payments/purchase.types'
import { OutreachPurchaseMetadata, TextOutreachPostPurchaseResult } from '../types/outreach.types'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'

@Injectable()
export class OutreachPurchaseHandlerService
  implements PurchaseHandler<OutreachPurchaseMetadata>
{
  constructor(
    @Inject(forwardRef(() => CampaignsService))
    private readonly campaignsService: CampaignsService,
  ) {}
  async validatePurchase({
    contactCount,
    pricePerContact,
  }: PurchaseMetadata<OutreachPurchaseMetadata>): Promise<void> {
    if (!contactCount) {
      throw new BadRequestException('contactCount is required')
    }

    if (pricePerContact === null || pricePerContact === undefined) {
      throw new BadRequestException('pricePerContact is required')
    }
  }

  async calculateAmount({
    contactCount,
    pricePerContact,
  }: PurchaseMetadata<OutreachPurchaseMetadata>): Promise<number> {
    return contactCount * pricePerContact
  }

  async handleTextOutreachPostPurchase(
    paymentIntentId: string,
    metadata: PurchaseMetadata<OutreachPurchaseMetadata>,
  ): Promise<TextOutreachPostPurchaseResult> {
    const { campaignId, contactCount, outreachType } = metadata

    if (!campaignId) {
      throw new BadRequestException('campaignId is required in metadata')
    }

    if (!contactCount) {
      throw new BadRequestException('contactCount is required in metadata')
    }

    // Get the campaign
    const campaign = await this.campaignsService.findUnique({
      where: { id: campaignId },
    })
    if (!campaign) {
      throw new BadRequestException('Campaign not found')
    }

    // Get current reported voter goals
    const currentData = campaign.data as any
    const currentReportedVoterGoals = currentData?.reportedVoterGoals || {}
    const currentTextCount = currentReportedVoterGoals.text || 0

    // Update the campaign with the new text contact count
    const updatedData = {
      ...currentData,
      reportedVoterGoals: {
        ...currentReportedVoterGoals,
        text: currentTextCount + contactCount,
      },
    }

    // Save the updated campaign
    await this.campaignsService.update({
      where: { id: campaignId },
      data: {
        data: updatedData,
      },
    })

    return {
      campaignId,
      contactCount,
      outreachType,
      newTextCount: currentTextCount + contactCount,
    }
  }
}
