import { Module } from '@nestjs/common'
import { StripeService } from './stripe/stripe.service'
import { PurchaseController } from './purchase.controller'
import { UsersModule } from '../users/users.module'
import { PaymentsController } from './payments.controller'
import { StripeEventsService } from './stripe/stripe-events.service'
import { PrismaModule } from '../prisma/prisma.module'
import { CampaignsModule } from '../campaigns/campaigns.module'

@Module({
  providers: [StripeService, StripeEventsService],
  controllers: [PurchaseController, PaymentsController],
  imports: [UsersModule, CampaignsModule, PrismaModule],
})
export class PaymentsModule {}
