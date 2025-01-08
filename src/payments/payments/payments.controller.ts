import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  NotImplementedException,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common'
import { PublicAccess } from '../../authentication/decorators/PublicAccess.decorator'
import { StripeService } from '../stripe/stripe.service'
import { Stripe } from 'stripe'
import { checkoutSessionCompletedHandler } from './eventHandlers/checkoutSessionCompletedHandler'
import { checkoutSessionExpiredHandler } from './eventHandlers/checkoutSessionExpiredHandler'
import { customerSubscriptionResumedHandler } from './eventHandlers/customerSubscriptionResumedHandler'
import { customerSubscriptionUpdatedHandler } from './eventHandlers/customerSubscriptionUpdatedHandler'
import { customerSubscriptionDeletedHandler } from './eventHandlers/customerSubscriptionDeletedHandler'

enum WebhookEventType {
  CheckoutSessionCompleted = 'checkout.session.completed',
  CheckoutSessionExpired = 'checkout.session.expired',
  CustomerSubscriptionDeleted = 'customer.subscription.deleted',
  CustomerSubscriptionUpdated = 'customer.subscription.updated',
  CustomerSubscriptionResumed = 'customer.subscription.resumed',
}

const WEBHOOK_HANDLERS = {
  [WebhookEventType.CheckoutSessionCompleted]: checkoutSessionCompletedHandler,
  [WebhookEventType.CheckoutSessionExpired]: checkoutSessionExpiredHandler,
  [WebhookEventType.CustomerSubscriptionDeleted]:
    customerSubscriptionDeletedHandler,
  [WebhookEventType.CustomerSubscriptionUpdated]:
    customerSubscriptionUpdatedHandler,
  [WebhookEventType.CustomerSubscriptionResumed]:
    customerSubscriptionResumedHandler,
}

@Controller('payments')
export class PaymentsController {
  private logger = new Logger(PaymentsController.name)
  constructor(private readonly stripe: StripeService) {}

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
      event = await this.stripe.parseWebhookEvent(
        rawBody as Buffer,
        stripeSignature,
      )
    } catch (e) {
      this.logger.warn('Failed to parse Stripe event', e)
      throw new BadRequestException('Failed to parse Stripe event')
    }

    this.logger.log(`processing event.type => ${event.type}`)
    try {
      if (!WEBHOOK_HANDLERS[event.type]) {
        throw new NotImplementedException('Unsupported event type')
      }
      await WEBHOOK_HANDLERS[event.type](event)
    } catch (e) {
      this.logger.error('Failed to process Stripe event', e)
      throw e instanceof HttpException
        ? e
        : new BadRequestException('Failed to process Stripe event')
    }
  }
}
