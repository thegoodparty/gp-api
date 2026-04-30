import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Patch,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { Roles } from 'src/authentication/decorators/Roles.decorator'
import { AdminOrM2MGuard } from 'src/authentication/guards/AdminOrM2M.guard'
import { Stripe } from 'stripe'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { StripeService } from '../vendors/stripe/services/stripe.service'
import { PaymentEventsService } from './services/paymentEventsService'
import { PaymentsService } from './services/payments.service'
import { PinoLogger } from 'nestjs-pino'

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly stripeEvents: PaymentEventsService,
    private readonly campaignsService: CampaignsService,
    private readonly paymentsService: PaymentsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PaymentsController.name)
  }

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
        // NestJS raw body is typed as unknown — framework does not expose Buffer type statically
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        rawBody as Buffer,
        stripeSignature,
      )
    } catch (e) {
      this.logger.warn({ e }, 'Failed to parse Stripe event')
      throw new BadRequestException('Failed to parse Stripe event')
    }

    this.logger.debug({ event }, `processing event.type => ${event.type}`)
    try {
      await this.stripeEvents.handleEvent(event)
    } catch (e) {
      this.logger.error({ e }, 'Failed to process Stripe event')
      throw e instanceof HttpException
        ? e
        : new BadRequestException('Failed to process Stripe event')
    }
  }

  @Patch('fix-missing-customer-id')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  async fixMissingCustomerIds() {
    return this.paymentsService.fixMissingCustomerIds()
  }

  /**
   * Replays the Stripe subscription-checkout success path for a user whose
   * webhook originally failed and is now stuck on "Subscription Pending".
   * See ENG-7570.
   */
  @Post('recover-pending-subscription')
  @UseGuards(AdminOrM2MGuard)
  @HttpCode(HttpStatus.OK)
  async recoverPendingSubscription(@Body() body: { userId: number }) {
    const userId = Number(body?.userId)
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('userId is required and must be a number')
    }
    return this.stripeEvents.replayPendingProCheckoutForUser(userId)
  }
}
