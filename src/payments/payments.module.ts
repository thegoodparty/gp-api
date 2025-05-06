import { Module } from '@nestjs/common'
import { StripeService } from '../stripe/services/stripe.service'
import { PurchaseController } from './purchase.controller'
import { PaymentsController } from './payments.controller'
import { PaymentEventsService } from './services/paymentEventsService'
import { EmailModule } from '../email/email.module'
import { CampaignsModule } from '../campaigns/campaigns.module'

@Module({
  providers: [StripeService, PaymentEventsService],
  controllers: [PurchaseController, PaymentsController],
  imports: [EmailModule, CampaignsModule],
})
export class PaymentsModule {}
