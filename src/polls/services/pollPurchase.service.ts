import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PurchaseHandler, PurchaseMetadata } from 'src/payments/purchase.types'
import { PollPurchaseMetadata } from '../types/pollPurchase.types'

const PRICE_PER_TEXT = 0.03

@Injectable()
export class PollPurchaseHandlerService
  implements PurchaseHandler<PollPurchaseMetadata>
{
  private readonly logger = new Logger(PollPurchaseHandlerService.name)

  async validatePurchase({
    pollId,
    count,
  }: PurchaseMetadata<PollPurchaseMetadata>): Promise<void> {
    if (!pollId) {
      throw new BadRequestException('pollId is required')
    }

    if (!count || count <= 0) {
      throw new BadRequestException('count must be a positive number')
    }
  }

  async calculateAmount({
    count,
  }: PurchaseMetadata<PollPurchaseMetadata>): Promise<number> {
    return count * PRICE_PER_TEXT * 100
  }

  async executePostPurchase(
    paymentIntentId: string,
    metadata: PurchaseMetadata<PollPurchaseMetadata>,
  ): Promise<void> {
    const { pollId, count } = metadata

    this.logger.log(
      `Poll purchase completed: pollId=${pollId}, count=${count}, paymentIntentId=${paymentIntentId}`,
    )
    // TODO: Swain, please add the post-purchase logic here
  }
}
