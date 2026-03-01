import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common'
import { Timeout } from '@nestjs/schedule'
import { Prisma, User } from '@prisma/client'
import { StripeService } from 'src/vendors/stripe/services/stripe.service'
import { UsersService } from '../../users/services/users.service'
import { PaymentIntentPayload, PaymentType } from '../payments.types'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class PaymentsService {
  constructor(
    private readonly stripe: StripeService,
    private readonly usersService: UsersService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PaymentsService.name)
  }

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

  /**
   * Gets a validated user from a checkout session.
   * Used for Custom Checkout flows where metadata is passed directly from the session.
   */
  async getValidatedSessionUser(
    sessionId: string,
    metadata: Record<string, string>,
  ): Promise<{ session: { id: string }; user: User }> {
    const userId = metadata?.userId
    if (!userId) {
      throw new BadGatewayException('No userId found in session metadata')
    }

    const user = await this.usersService.findUser({
      id: parseInt(userId),
    })

    if (!user) {
      throw new BadGatewayException('User not found for session')
    }

    return { session: { id: sessionId }, user }
  }

  async updateMissingCustomerId(email: string) {
    const user = await this.usersService.findUserByEmail(email)
    if (!user) {
      return null
    }

    if (user.metaData?.customerId) {
      return null
    }

    this.logger.info(`userId: ${user.id} missing customerId`)

    const checkoutSessionId = user.metaData?.checkoutSessionId as string
    const customerId = checkoutSessionId
      ? await this.stripe.fetchCustomerIdFromCheckoutSession(checkoutSessionId)
      : await this.stripe.fetchCustomerIdByEmail(user.email)
    if (!customerId) {
      return null
    }
    this.logger.info(
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
        this.logger.error({ e }, `Failed backfill for ${email}`)
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
        this.logger.error({ error }, `Failed for ${email}:`)
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
