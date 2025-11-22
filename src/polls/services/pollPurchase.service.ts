import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PurchaseHandler, PurchaseMetadata } from 'src/payments/purchase.types'
import { PollPurchaseMetadata } from '../types/pollPurchase.types'
import { PollsService } from './polls.service'
import z from 'zod'

const PRICE_PER_TEXT = 0.03

const countSchema = z.coerce.number().int().min(1)

@Injectable()
export class PollPurchaseHandlerService
  implements PurchaseHandler<PollPurchaseMetadata>
{
  private readonly logger = new Logger(PollPurchaseHandlerService.name)

  constructor(private readonly pollsService: PollsService) {}

  async validatePurchase({
    pollId,
    count,
  }: PurchaseMetadata<PollPurchaseMetadata>): Promise<void> {
    if (!pollId) {
      throw new BadRequestException('pollId is required')
    }

    const result = countSchema.safeParse(count)
    if (!result.success) {
      throw new BadRequestException(
        'count must be a positive number: ' + result.error.message,
      )
    }
  }

  async calculateAmount({
    count,
  }: PurchaseMetadata<PollPurchaseMetadata>): Promise<number> {
    return countSchema.parse(count) * PRICE_PER_TEXT * 100
  }

  async executePostPurchase(
    paymentIntentId: string,
    metadata: PurchaseMetadata<PollPurchaseMetadata>,
  ): Promise<void> {
    const { pollId, count } = metadata

    this.logger.log(
      `Poll purchase completed: pollId=${pollId}, count=${count}, paymentIntentId=${paymentIntentId}`,
    )

    await this.pollsService.expandPoll({
      pollId,
      additionalRecipientCount: countSchema.parse(count),
    })
  }
}
