import { Module } from '@nestjs/common'
import { PurchaseController } from './purchase.controller'
import { PaymentsController } from './payments.controller'
import { PaymentEventsService } from './services/paymentEventsService'
import { EmailModule } from '../email/email.module'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { StripeModule } from 'src/stripe/stripe.module'
import { PaymentsService } from './services/payments.service'

@Module({
  providers: [PaymentEventsService, PaymentsService],
  controllers: [PurchaseController, PaymentsController],
  imports: [EmailModule, CampaignsModule, StripeModule],
  exports: [PaymentsService],
})
export class PaymentsModule {}
