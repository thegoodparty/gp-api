import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'
import { Stripe } from 'stripe'
import { PaymentEventsService } from './services/paymentEventsService'
import { StripeService } from '../stripe/services/stripe.service'
import { Roles } from 'src/authentication/decorators/Roles.decorator'
import { UserRole } from '@prisma/client'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { parseCampaignElectionDate } from '../campaigns/util/parseCampaignElectionDate.util'

@Controller('payments')
export class PaymentsController {
  private logger = new Logger(PaymentsController.name)

  constructor(
    private readonly stripeService: StripeService,
    private readonly stripeEvents: PaymentEventsService,
    private readonly campaignsService: CampaignsService,
  ) {}

  @Post('events')
  @PublicAccess()
  @HttpCode(HttpStatus.OK)
  async handleStripeEvent(
    @Req() { rawBody }: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ) {
    const stripeSignature = headers['stripe-signature']
    if (!stripeSignature) {
      throw new BadRequestException('Stripe-Signature header is missing')
    }

    let event: Stripe.Event
    try {
      event = await this.stripeService.parseWebhookEvent(
        rawBody as Buffer,
        stripeSignature,
      )
    } catch (e) {
      this.logger.warn('Failed to parse Stripe event', e)
      throw new BadRequestException('Failed to parse Stripe event')
    }

    this.logger.debug(`processing event.type => ${event.type}`, event)
    try {
      await this.stripeEvents.handleEvent(event)
    } catch (e) {
      this.logger.error('Failed to process Stripe event', e)
      throw e instanceof HttpException
        ? e
        : new BadRequestException('Failed to process Stripe event')
    }
  }

  // TODO: temporary endpoint. remove after updating.
  @Post('mass-update-cancel-at')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  async massUpdateCancelAt() {
    const campaigns = await this.campaignsService.findMany({
      where: {
        isPro: true,
        details: {
          path: ['subscriptionId'],
          not: { equals: null },
        },
      },
    })

    const results = {
      total: campaigns.length,
      successful: 0,
      failed: 0,
      errors: [] as string[],
    }

    for (const campaign of campaigns) {
      try {
        const { details } = campaign
        const subscriptionId = details?.subscriptionId as string

        const electionDate = parseCampaignElectionDate(campaign)

        if (!electionDate) {
          results.errors.push(
            `Campaign ${campaign.id}: No valid election date found`,
          )
          results.failed++
          continue
        }

        if (electionDate < new Date()) {
          results.errors.push(
            `Campaign ${campaign.id}: Election date is in the past`,
          )
          results.failed++
          continue
        }

        await this.stripeService.setSubscriptionCancelAt(
          subscriptionId,
          electionDate,
        )
        results.successful++
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        results.errors.push(`Campaign ${campaign.id}: ${errorMessage}`)
        results.failed++
      }
    }

    return results
  }
}
