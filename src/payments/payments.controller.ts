import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Patch,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'
import { Stripe } from 'stripe'
import { PaymentEventsService } from './services/paymentEventsService'
import { StripeService } from '../vendors/stripe/services/stripe.service'
import { CampaignsService } from '../campaigns/services/campaigns.service'
import { PaymentsService } from './services/payments.service'
import { UserRole } from '@prisma/client'
import { Roles } from 'src/authentication/decorators/Roles.decorator'

@Controller('payments')
export class PaymentsController {
  private logger = new Logger(PaymentsController.name)

  constructor(
    private readonly stripeService: StripeService,
    private readonly stripeEvents: PaymentEventsService,
    private readonly campaignsService: CampaignsService,
    private readonly paymentsService: PaymentsService,
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

  @Patch('fix-missing-customer-id')
  @Roles(UserRole.admin)
  @HttpCode(HttpStatus.OK)
  async fixMissingCustomerIds() {
    return this.paymentsService.fixMissingCustomerIds()
  }
}
