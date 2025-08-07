import { BadRequestException, Injectable } from '@nestjs/common'
import { PurchaseHandler, PurchaseMetadata } from 'src/payments/purchase.types'
import { OutreachPurchaseMetadata } from '../types/outreach.types'

@Injectable()
export class OutreachPurchaseHandlerService
  implements PurchaseHandler<OutreachPurchaseMetadata>
{
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
}
