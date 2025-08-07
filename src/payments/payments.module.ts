import { forwardRef, Module } from '@nestjs/common'
import { PurchaseController } from './purchase.controller'
import { PaymentsController } from './payments.controller'
import { PaymentEventsService } from './services/paymentEventsService'
import { PurchaseService } from './services/purchase.service'
import { EmailModule } from '../email/email.module'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { UsersModule } from '../users/users.module'
import { StripeModule } from 'src/stripe/stripe.module'
import { PaymentsService } from './services/payments.service'

@Module({
  providers: [PaymentEventsService, PaymentsService, PurchaseService],
  controllers: [PurchaseController, PaymentsController],
  imports: [
    EmailModule,
    forwardRef(() => CampaignsModule),
    UsersModule,
    StripeModule,
  ],
  exports: [PaymentsService, PurchaseService],
})
export class PaymentsModule {}
