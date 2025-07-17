import { Module, forwardRef } from '@nestjs/common'
import { PurchaseController } from './purchase.controller'
import { PaymentsController } from './payments.controller'
import { PaymentEventsService } from './services/paymentEventsService'
import { PurchaseService } from './services/purchase.service'
import { DomainPurchaseHandler } from './handlers/domain-purchase.handler'
import { EmailModule } from '../email/email.module'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { WebsitesModule } from '../websites/websites.module'
import { StripeModule } from 'src/stripe/stripe.module'
import { PaymentsService } from './services/payments.service'

@Module({
  providers: [
    PaymentEventsService,
    PaymentsService,
    PurchaseService,
    DomainPurchaseHandler,
  ],
  controllers: [PurchaseController, PaymentsController],
  imports: [
    EmailModule,
    CampaignsModule,
    forwardRef(() => WebsitesModule),
    StripeModule,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
