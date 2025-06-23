import { Module } from '@nestjs/common'
import { StripeService } from '../stripe/services/stripe.service'
import { PurchaseController } from './purchase.controller'
import { PaymentsController } from './payments.controller'
import { PaymentEventsService } from './services/paymentEventsService'
import { EmailModule } from '../email/email.module'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { AnalyticsModule } from 'src/analytics/analytics.module'

@Module({
  providers: [StripeService, PaymentEventsService],
  controllers: [PurchaseController, PaymentsController],
  imports: [EmailModule, CampaignsModule, AnalyticsModule],
})
export class PaymentsModule {}
