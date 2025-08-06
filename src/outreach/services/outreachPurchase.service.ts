import { Injectable, BadRequestException } from '@nestjs/common'
import { PurchaseHandler, PurchaseMetadata } from 'src/payments/purchase.types'
import { OutreachService } from './outreach.service'
import { PaymentsService } from 'src/payments/services/payments.service'
import { OutreachType, OutreachStatus } from '@prisma/client'

@Injectable()
export class OutreachPurchaseHandlerService implements PurchaseHandler {
  constructor(
    private readonly outreachService: OutreachService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async validatePurchase(metadata: PurchaseMetadata): Promise<void> {
    const { campaignId, outreachType } = metadata as any

    if (!campaignId) {
      throw new BadRequestException('Campaign ID is required')
    }

    if (!outreachType || !Object.values(OutreachType).includes(outreachType)) {
      throw new BadRequestException('Valid outreach type is required')
    }

    // Additional validation could be added here
    // e.g., checking if campaign exists, user has permission, etc.
  }

  async calculateAmount(metadata: PurchaseMetadata): Promise<number> {
    const { outreachType, audienceSize } = metadata as any

    // Define pricing based on outreach type
    const basePricing = {
      [OutreachType.text]: 500, // $5.00 per message
      [OutreachType.doorKnocking]: 1000, // $10.00 per contact
      [OutreachType.phoneBanking]: 300, // $3.00 per call
      [OutreachType.socialMedia]: 200, // $2.00 per post
      [OutreachType.robocall]: 100, // $1.00 per call
    }

    const basePrice = basePricing[outreachType] || 500
    const size = audienceSize || 1

    // Calculate total amount in cents
    return basePrice * size
  }

  async executePostPurchase(
    paymentIntentId: string,
    metadata: PurchaseMetadata,
  ): Promise<any> {
    const { campaignId, outreachType, audienceRequest, script, message, date } =
      metadata as any

    const { paymentIntent: _paymentIntent, user: _user } =
      await this.paymentsService.getValidatedPaymentUser(paymentIntentId)

    // Create outreach record with paid status
    const outreach = await this.outreachService.create({
      campaignId: parseInt(campaignId),
      outreachType,
      status: OutreachStatus.paid,
      audienceRequest,
      script,
      message,
      date: date ? new Date(date).toISOString() : undefined,
    })

    return {
      outreach,
      message: 'Outreach campaign created successfully',
    }
  }
}
