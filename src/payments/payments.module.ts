import { Module } from '@nestjs/common'
import { StripeService } from './stripe/stripe.service'
import { PurchaseController } from './purchase.controller'
import { PaymentsController } from './payments.controller'
import { StripeEventsService } from './stripe/stripeEvents.service'
import { EmailModule } from '../email/email.module'

@Module({
  providers: [StripeService, StripeEventsService],
  controllers: [PurchaseController, PaymentsController],
  imports: [EmailModule],
})
export class PaymentsModule {}
