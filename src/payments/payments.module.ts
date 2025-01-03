import { Module } from '@nestjs/common'
import { StripeService } from './stripe/stripe.service'
import { PurchaseController } from './purchase/purchase.controller'
import { UsersModule } from '../users/users.module'

@Module({
  providers: [StripeService],
  controllers: [PurchaseController],
  imports: [UsersModule],
})
export class PaymentsModule {}
