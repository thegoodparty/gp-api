import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PurchaseHandler, PurchaseMetadata } from 'src/payments/purchase.types'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { OutreachPurchaseMetadata } from '../types/outreach.types'
import { FREE_TEXTS_OFFER } from 'src/shared/constants/freeTextsOffer'

const DOLLARS_TO_CENTS = 100

@Injectable()
export class OutreachPurchaseHandlerService
  implements PurchaseHandler<OutreachPurchaseMetadata>
{
  private readonly logger = new Logger(OutreachPurchaseHandlerService.name)

  constructor(private readonly campaignsService: CampaignsService) {}

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
    campaignId,
    outreachType,
  }: PurchaseMetadata<OutreachPurchaseMetadata>): Promise<number> {
    if (!campaignId || outreachType !== 'p2p') {
      return contactCount * pricePerContact * DOLLARS_TO_CENTS
    }

    const hasOffer =
      await this.campaignsService.checkFreeTextsEligibility(campaignId)

    if (hasOffer) {
      const discountedContactCount = Math.max(
        0,
        contactCount - FREE_TEXTS_OFFER.COUNT,
      )
      const finalAmount = discountedContactCount * pricePerContact * DOLLARS_TO_CENTS

      return finalAmount
    }

    return contactCount * pricePerContact * DOLLARS_TO_CENTS
  }

  async calculateDiscount(
    contactCount: number,
    pricePerContact: number,
    campaignId?: number,
    outreachType?: string,
  ): Promise<number> {
    if (!campaignId || outreachType !== 'p2p') {
      return 0
    }

    const hasOffer =
      await this.campaignsService.checkFreeTextsEligibility(campaignId)

    if (hasOffer) {
      // Calculate discount amount for up to 5,000 texts
      const freeTexts = Math.min(contactCount, FREE_TEXTS_OFFER.COUNT)
      return freeTexts * pricePerContact * DOLLARS_TO_CENTS
    }

    return 0
  }

  async executePostPurchase(
    paymentIntentId: string,
    metadata: PurchaseMetadata<OutreachPurchaseMetadata>,
  ): Promise<void> {
    const { campaignId, outreachType } = metadata

    if (!campaignId || outreachType !== 'p2p') {
      return
    }

    try {
      const hasOffer =
        await this.campaignsService.checkFreeTextsEligibility(campaignId)
      if (hasOffer) {
        await this.campaignsService.redeemFreeTexts(campaignId)
        this.logger.log(
          `Free texts offer redeemed for campaign ${campaignId} after payment ${paymentIntentId}`,
        )
      }
    } catch (error) {
      this.logger.error(
        `Failed to redeem free texts offer for campaign ${campaignId} after payment ${paymentIntentId}:`,
        error,
      )
    }
  }
}
