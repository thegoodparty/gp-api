import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { Prisma, User } from '@prisma/client'
import { StripeService } from 'src/vendors/stripe/services/stripe.service'
import { CampaignsService } from '../../campaigns/services/campaigns.service'
import { UsersService } from '../../users/services/users.service'
import { PaymentIntentPayload, PaymentType } from '../payments.types'

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)

  constructor(
    private readonly stripe: StripeService,
    private readonly usersService: UsersService,
    private readonly campaignsService: CampaignsService,
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

    const checkoutSessionId = user.metaData?.checkoutSessionId as string
    if (!checkoutSessionId) {
      return null
    }
    const customerId =
      await this.stripe.fetchCustomerIdFromCheckoutSession(checkoutSessionId)
    if (!customerId) {
      return null
    }

    await this.usersService.patchUserMetaData(user!.id, {
      customerId,
      checkoutSessionId: null,
    })
    return user
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

  async fixAutoScheduledCancellations(dryRun = true) {
    const results: {
      auto: string[]
      manual: string[]
      failed: { slug: string; error: string }[]
    } = {
      auto: [],
      manual: [],
      failed: [],
    }

    const campaigns = await this.campaignsService.findMany({
      where: {
        isPro: true,
      },
    })

    const campaignsWithScheduledCancellations = campaigns.filter((campaign) => {
      const details = campaign.details as PrismaJson.CampaignDetails
      return details?.subscriptionCancelAt && details?.subscriptionCancelAt > 0
    })

    this.logger.log(
      `Found ${campaignsWithScheduledCancellations.length} campaigns with scheduled cancellations`,
    )

    for (const campaign of campaignsWithScheduledCancellations) {
      const { slug } = campaign
      try {
        const details = campaign.details as PrismaJson.CampaignDetails | null
        const subscriptionId = details?.subscriptionId
        if (!subscriptionId) {
          continue
        }

        const subscription =
          await this.stripe.retrieveSubscription(subscriptionId)
        if (!subscription.cancel_at) {
          continue
        }

        const wasUserInitiated =
          subscription.cancellation_details?.comment != null ||
          subscription.cancellation_details?.feedback != null
        if (wasUserInitiated) {
          results.manual.push(slug)
          this.logger.log(
            `Manual cancellation for ${slug} - Reason: ${subscription.cancellation_details?.reason} - Comment: ${subscription.cancellation_details?.comment}`,
          )
        } else {
          if (!dryRun) {
            await this.stripe.removeSubscriptionCancellation(subscriptionId)

            await this.campaignsService.update({
              where: { id: campaign.id },
              data: {
                details: {
                  ...details,
                  subscriptionCancelAt: null,
                  endOfElectionSubscriptionCanceled: false,
                },
              },
            })

            this.logger.log(`✅ Fixed auto-scheduled cancellation for ${slug}`)
          } else {
            this.logger.log(
              `Dry run: Would fix auto-scheduled cancellation for ${slug}`,
            )
          }
          results.auto.push(slug)
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        results.failed.push({ slug, error: errorMessage })
        this.logger.error(`Failed for ${slug}:`, error)
      }
    }

    return {
      message: dryRun
        ? `DRY RUN: Would process ${results.auto.length} auto-scheduled cancellations`
        : `Processed ${results.auto.length} auto-scheduled cancellations`,
      dryRun,
      auto: results.auto.length,
      manual: results.manual.length,
      failed: results.failed.length,
      details: results,
    }
  }
}
