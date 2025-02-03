import { Module } from '@nestjs/common'
import { StripeService } from './stripe/stripe.service'
import { PurchaseController } from './purchase.controller'
import { UsersModule } from '../users/users.module'
import { PaymentsController } from './payments.controller'
import { StripeEventsService } from './stripe/stripeEvents.service'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { EmailModule } from '../email/email.module'
import { VotersModule } from 'src/voters/voters.module'
import { CrmModule } from '../crm/crmModule'

@Module({
  providers: [StripeService, StripeEventsService],
  controllers: [PurchaseController, PaymentsController],
  imports: [UsersModule, CampaignsModule, EmailModule, VotersModule, CrmModule],
})
export class PaymentsModule {}
