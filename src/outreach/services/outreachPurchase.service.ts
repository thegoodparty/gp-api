import { BadRequestException, Injectable } from '@nestjs/common'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { PurchaseHandler } from 'src/payments/purchase.types'
import { FREE_TEXTS_OFFER } from 'src/shared/constants/freeTextsOffer'
import { OutreachPurchaseMetadata } from '../types/outreach.types'
import { PinoLogger } from 'nestjs-pino'

const PRICE_PER_CONTACT_TENTH_CENTS = 35

function calcAmountInCents(contactCount: number): number {
  const totalTenthCents = contactCount * PRICE_PER_CONTACT_TENTH_CENTS
  return Math.floor((totalTenthCents + 5) / 10)
}

@Injectable()
export class OutreachPurchaseHandlerService
  implements PurchaseHandler<OutreachPurchaseMetadata>
{
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OutreachPurchaseHandlerService.name)
  }

  async validatePurchase({
    contactCount,
  }: OutreachPurchaseMetadata): Promise<void> {
    if (!contactCount) {
      throw new BadRequestException('contactCount is required')
    }
  }

  async calculateAmount({
    contactCount,
    campaignId,
    outreachType,
  }: OutreachPurchaseMetadata): Promise<number> {
    if (!campaignId || outreachType !== 'p2p') {
      return calcAmountInCents(contactCount)
    }

    const hasOffer =
      await this.campaignsService.checkFreeTextsEligibility(campaignId)

    if (hasOffer) {
      const discountedContactCount = Math.max(
        0,
        contactCount - FREE_TEXTS_OFFER.COUNT,
      )
      const finalAmount = calcAmountInCents(discountedContactCount)

      this.logger.info(
        `Campaign ${campaignId}: applying free texts discount (${contactCount} contacts, ${discountedContactCount} billable, amount: ${finalAmount})`,
      )

      return finalAmount
    }

    return calcAmountInCents(contactCount)
  }

  async calculateDiscount(
    contactCount: number,
    campaignId?: number,
    outreachType?: string,
  ): Promise<number> {
    if (!campaignId || outreachType !== 'p2p') {
      return 0
    }

    const hasOffer =
      await this.campaignsService.checkFreeTextsEligibility(campaignId)

    if (hasOffer) {
      const freeTexts = Math.min(contactCount, FREE_TEXTS_OFFER.COUNT)
      return calcAmountInCents(freeTexts)
    }

    return 0
  }

  async executePostPurchase(
    paymentIntentId: string,
    rawMetadata: unknown,
  ): Promise<void> {
    if (
      !rawMetadata ||
      typeof rawMetadata !== 'object' ||
      !('outreachType' in rawMetadata) ||
      !('campaignId' in rawMetadata)
    ) {
      return
    }

    const { outreachType, campaignId: rawCampaignId } = rawMetadata
    const campaignId = rawCampaignId ? Number(rawCampaignId) : undefined

    if (!campaignId || outreachType !== 'p2p') {
      return
    }

    try {
      const hasOffer =
        await this.campaignsService.checkFreeTextsEligibility(campaignId)
      if (hasOffer) {
        await this.campaignsService.redeemFreeTexts(campaignId)
        this.logger.info(
          `Free texts offer redeemed for campaign ${campaignId} after payment ${paymentIntentId}`,
        )
      }
    } catch (error) {
      this.logger.error(
        { error },
        `Failed to redeem free texts offer for campaign ${campaignId} after payment ${paymentIntentId}:`,
      )
    }
  }
}
