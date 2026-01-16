import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { Timeout } from '@nestjs/schedule'
import { Prisma, User } from '@prisma/client'
import { StripeService } from 'src/vendors/stripe/services/stripe.service'
import { UsersService } from '../../users/services/users.service'
import { PaymentIntentPayload, PaymentType } from '../payments.types'

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)

  constructor(
    private readonly stripe: StripeService,
    private readonly usersService: UsersService,
  ) {}

  async createPayment<T extends PaymentType>(
    user: User,
    payload: PaymentIntentPayload<T>,
  ) {
    return this.stripe.createPaymentIntent(user, payload)
  }

  async retrievePayment(paymentId: string) {
    return this.stripe.retrievePaymentIntent(paymentId)
  }

  async getValidatedPaymentUser(
    paymentIntentId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ paymentIntent: any; user: User }> {
    const paymentIntent = await this.retrievePayment(paymentIntentId)

    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException(
        `Payment not completed. Status: ${paymentIntent.status}`,
      )
    }

    const userId = paymentIntent.metadata?.userId
    if (!userId) {
      throw new BadGatewayException('No userId found in payment metadata')
    }

    const user = await this.usersService.findUser({
      id: parseInt(userId),
    })

    if (!user) {
      throw new BadGatewayException('User not found for payment')
    }

    return { paymentIntent, user }
  }

  async updateMissingCustomerId(email: string) {
    const user = await this.usersService.findUserByEmail(email)
    if (!user) {
      return null
    }

    if (user.metaData?.customerId) {
      return null
    }

    this.logger.log(`userId: ${user.id} missing customerId`)

    const checkoutSessionId = user.metaData?.checkoutSessionId as string
    const customerId = checkoutSessionId
      ? await this.stripe.fetchCustomerIdFromCheckoutSession(checkoutSessionId)
      : await this.stripe.fetchCustomerIdByEmail(user.email)
    if (!customerId) {
      return null
    }
    this.logger.log(
      `Successfully retrieved customerId ${customerId} for user ${user.id}`,
    )

    await this.usersService.patchUserMetaData(user!.id, {
      customerId,
      checkoutSessionId: null,
    })
    return user
  }

  @Timeout(0)
  private async backfillMissingCustomerIdsOnBoot() {
    const emails = await this.stripe.listActiveSubscriptionCustomerEmails()
    for (const email of emails) {
      try {
        const user = await this.usersService.findUserByEmail(email)
        if (!user) {
          continue
        }
        if (user.metaData?.customerId) {
          continue
        }
        await this.updateMissingCustomerId(email)
      } catch (e) {
        this.logger.error(`Failed backfill for ${email}`, e)
      }
    }
  }

  async fixMissingCustomerIds() {
    const results: {
      success: string[]
      failed: { email: string; error: string }[]
      skipped: string[]
    } = {
      success: [],
      failed: [],
      skipped: [],
    }

    const batch = await this.usersService.findMany({
      where: {
        metaData: {
          path: ['checkoutSessionId'],
          not: Prisma.AnyNull,
        },
      },
      select: {
        email: true,
        id: true,
        metaData: true,
      },
      take: 50,
    })

    // Filter to only users without customerId
    const users = batch.filter((user) => {
      const metadata = user.metaData as {
        customerId?: string
        checkoutSessionId?: string
      } | null
      return !metadata?.customerId
    })

    for (const dbUser of users) {
      const { email } = dbUser
      try {
        const user = await this.updateMissingCustomerId(email)
        if (!user) {
          results.skipped.push(email)
          continue
        }
        results.success.push(user.email)
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        results.failed.push({ email, error: errorMessage })
        this.logger.error(`Failed for ${email}:`, error)
      }
    }

    return {
      message: `Processed ${users.length} users`,
      success: results.success.length,
      failed: results.failed.length,
      skipped: results.skipped.length,
      details: results,
    }
  }
}
