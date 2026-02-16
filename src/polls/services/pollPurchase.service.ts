import { PaymentsService } from '@/payments/services/payments.service'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import { PurchaseHandler } from 'src/payments/purchase.types'
import { UsersService } from 'src/users/services/users.service'
import { version as uuidVersion } from 'uuid'
import z from 'zod'
import { PollsService } from './polls.service'
import { MAX_POLL_MESSAGE_LENGTH } from '../schemas/poll.schema'

const MAX_CONSTITUENTS_PER_RUN = 10000

const uuidV7Schema = z.string().refine(
  (value) => {
    try {
      return uuidVersion(value) === 7
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
    pollPurchaseType: z.literal(PollPurchaseType.new),
    pollId: uuidV7Schema,
    name: z.string().min(1).max(100),
    message: z.string().min(1).max(MAX_POLL_MESSAGE_LENGTH),
    imageUrl: z.string().url().nullable().default(null),
    audienceSize: z.coerce.number().int().min(1).max(MAX_CONSTITUENTS_PER_RUN),
    scheduledDate: z.string().datetime(),
  }),
  z.object({
    pollPurchaseType: z
      .literal(PollPurchaseType.expansion)
      .optional()
      .default(PollPurchaseType.expansion),
    pollId: uuidV7Schema,
    count: z.coerce.number().int().min(1).max(MAX_CONSTITUENTS_PER_RUN),
    scheduledDate: z.string().datetime().optional(),
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
    private readonly usersService: UsersService,
  ) {}

  async validatePurchase(rawMetadata: unknown): Promise<void> {
    const result = PollPurchaseMetadataSchema.safeParse(rawMetadata)
    if (!result.success) {
      throw new BadRequestException(result.error.message)
    }
  }

  async calculateAmount(rawMetadata: unknown): Promise<number> {
    const metadata = PollPurchaseMetadataSchema.parse(rawMetadata)

    return metadata.pollPurchaseType === PollPurchaseType.expansion
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

    if (metadata.pollPurchaseType === PollPurchaseType.expansion) {
      return this.processExpansion(metadata)
    }

    const { user } =
      await this.paymentsService.getValidatedPaymentUser(paymentIntentId)

    return this.processNewPoll(metadata, user.id)
  }

  async handlePollPostPurchase(
    sessionId: string,
    rawMetadata: unknown,
  ): Promise<void> {
    const metadata = PollPurchaseMetadataSchema.parse(rawMetadata)

    this.logger.log(
      `Poll checkout session completed: sessionId=${sessionId} metadata=${JSON.stringify(metadata)}`,
    )

    if (metadata.pollPurchaseType === PollPurchaseType.expansion) {
      return this.processExpansion(metadata)
    }

    const userId = (rawMetadata as Record<string, string>)?.userId
    if (!userId) {
      throw new BadRequestException('No userId found in session metadata')
    }

    const user = await this.usersService.findUser({ id: parseInt(userId) })
    if (!user) {
      throw new BadRequestException(`User not found: ${userId}`)
    }

    return this.processNewPoll(metadata, user.id)
  }

  /**
   * Shared logic for expanding an existing poll with additional recipients.
   */
  private async processExpansion(
    metadata: z.infer<typeof PollPurchaseMetadataSchema> & {
      pollPurchaseType: PollPurchaseType.expansion
    },
  ): Promise<void> {
    await this.pollsService.expandPoll({
      pollId: metadata.pollId,
      additionalRecipientCount: metadata.count,
      scheduledDate: metadata.scheduledDate
        ? new Date(metadata.scheduledDate)
        : new Date(),
    })
  }

  /**
   * Shared logic for creating a new poll after purchase.
   */
  private async processNewPoll(
    metadata: z.infer<typeof PollPurchaseMetadataSchema> & {
      pollPurchaseType: PollPurchaseType.new
    },
    userId: number,
  ): Promise<void> {
    const electedOffice = await this.electedOfficeService.findFirst({
      where: { userId },
    })

    if (!electedOffice) {
      throw new BadRequestException(
        `Elected office not found for userId ${userId} poll ${metadata.pollId}`,
      )
    }

    await this.pollsService.create({
      id: metadata.pollId,
      name: metadata.name,
      electedOfficeId: electedOffice.id,
      messageContent: metadata.message,
      imageUrl: metadata.imageUrl,
      targetAudienceSize: metadata.audienceSize,
      scheduledDate: metadata.scheduledDate,
    })
  }
}
