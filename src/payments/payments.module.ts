import { forwardRef, Module } from '@nestjs/common'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { StripeModule } from 'src/vendors/stripe/stripe.module'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { EmailModule } from '../email/email.module'
import { UsersModule } from '../users/users.module'
import { PaymentsController } from './payments.controller'
import { PurchaseController } from './purchase.controller'
import { PaymentEventsService } from './services/paymentEventsService'
import { PaymentsService } from './services/payments.service'
import { PurchaseService } from './services/purchase.service'

@Module({
  providers: [PaymentEventsService, PaymentsService, PurchaseService],
  controllers: [PurchaseController, PaymentsController],
  imports: [
    EmailModule,
    forwardRef(() => CampaignsModule),
    UsersModule,
    StripeModule,
    SlackModule,
  ],
  exports: [PaymentsService, PurchaseService],
})
export class PaymentsModule {}
