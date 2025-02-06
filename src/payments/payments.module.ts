import { Module } from '@nestjs/common'
import { StripeService } from './stripe/stripe.service'
import { PurchaseController } from './purchase.controller'
import { UsersModule } from '../users/users.module'
import { PaymentsController } from './payments.controller'
import { StripeEventsService } from './stripe/stripeEvents.service'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { EmailModule } from '../email/email.module'

@Module({
  providers: [StripeService, StripeEventsService],
  controllers: [PurchaseController, PaymentsController],
  imports: [UsersModule, CampaignsModule, EmailModule],
})
export class PaymentsModule {}
