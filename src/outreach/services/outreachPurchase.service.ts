import { BadRequestException, Injectable } from '@nestjs/common'
import { PurchaseHandler, PurchaseMetadata } from 'src/payments/purchase.types'
import { OutreachService } from './outreach.service'
import { PaymentsService } from 'src/payments/services/payments.service'
import { OutreachPurchaseMetadata } from '../types/outreach.types'

@Injectable()
export class OutreachPurchaseHandlerService
  implements PurchaseHandler<OutreachPurchaseMetadata>
{
  constructor(
    private readonly outreachService: OutreachService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async validatePurchase({
    contactCount,
    pricePerContact,
  }: PurchaseMetadata<OutreachPurchaseMetadata>): Promise<void> {
    if (!contactCount) {
      throw new BadRequestException('contactCount is required')
    }

    if (pricePerContact) {
      throw new BadRequestException('pricePerContact is required')
    }
  }

  async calculateAmount({
    contactCount,
    pricePerContact,
  }: PurchaseMetadata<OutreachPurchaseMetadata>): Promise<number> {
    return contactCount * pricePerContact
  }
}
