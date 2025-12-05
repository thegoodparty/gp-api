import { PaymentsService } from '@/payments/services/payments.service'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import { PurchaseHandler } from 'src/payments/purchase.types'
import uuid from 'uuid'
import z from 'zod'
import { PollsService } from './polls.service'

const MAX_CONSTITUENTS_PER_RUN = 10000

const uuidV7Schema = z.string().refine(
  (value) => {
    try {
      return uuid.version(value) === 7
    } catch {
      return false
    }
  },
  {
    message: 'Invalid UUIDv7',
  },
)

enum PollPurchaseType {
  new = 'new',
  expansion = 'expansion',
}

const PollPurchaseMetadataSchema = z.union([
  z.object({
    type: z.literal(PollPurchaseType.new),
    pollId: uuidV7Schema,
    // TODO SWAIN: confirm these size restrictions (ENG-6101)
    name: z.string().min(1).max(100),
    message: z.string().min(1).max(1000),
    imageUrl: z.string().url().nullable().default(null),
    audienceSize: z.coerce.number().int().min(1).max(MAX_CONSTITUENTS_PER_RUN),
    scheduledDate: z.string().datetime(),
  }),
  z.object({
    type: z
      .literal(PollPurchaseType.expansion)
      .optional()
      .default(PollPurchaseType.expansion),
    pollId: uuidV7Schema,
    count: z.coerce.number().int().min(1).max(MAX_CONSTITUENTS_PER_RUN),
  }),
])

const PRICE_PER_TEXT_TENTH_CENTS = 35

function calcAmountInCents(textCount: number): number {
  const totalTenthCents = textCount * PRICE_PER_TEXT_TENTH_CENTS // integer
  return Math.floor((totalTenthCents + 5) / 10)
}

@Injectable()
export class PollPurchaseHandlerService implements PurchaseHandler<unknown> {
  private readonly logger = new Logger(PollPurchaseHandlerService.name)

  constructor(
    private readonly pollsService: PollsService,
    private readonly electedOfficeService: ElectedOfficeService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async validatePurchase(rawMetadata: unknown): Promise<void> {
    const result = PollPurchaseMetadataSchema.safeParse(rawMetadata)
    if (!result.success) {
      throw new BadRequestException(result.error.message)
    }
  }

  async calculateAmount(rawMetadata: unknown): Promise<number> {
    const metadata = PollPurchaseMetadataSchema.parse(rawMetadata)

    return metadata.type === PollPurchaseType.expansion
      ? calcAmountInCents(metadata.count)
      : calcAmountInCents(metadata.audienceSize)
  }

  async executePostPurchase(
    paymentIntentId: string,
    rawMetadata: unknown,
  ): Promise<void> {
    const metadata = PollPurchaseMetadataSchema.parse(rawMetadata)

    this.logger.log(
      `Poll purchase completed: paymentIntentId=${paymentIntentId} metadata=${JSON.stringify(metadata)}`,
    )

    if (metadata.type === PollPurchaseType.expansion) {
      await this.pollsService.expandPoll({
        pollId: metadata.pollId,
        additionalRecipientCount: metadata.count,
      })
      return
    }

    const { user } =
      await this.paymentsService.getValidatedPaymentUser(paymentIntentId)

    const electedOffice = await this.electedOfficeService.findFirst({
      where: { userId: user.id },
    })

    if (!electedOffice) {
      throw new BadRequestException(
        `Elected office not found for userId ${user.id} poll ${metadata.pollId}`,
      )
    }

    await this.pollsService.create({
      id: metadata.pollId,
      status: 'SCHEDULED',
      name: metadata.name,
      electedOfficeId: electedOffice.id,
      messageContent: metadata.message,
      imageUrl: metadata.imageUrl,
      targetAudienceSize: metadata.audienceSize,
      scheduledDate: metadata.scheduledDate,
    })
  }
}
