import { Module } from '@nestjs/common'
import { StripeService } from './stripe/stripe.service'
import { PurchaseController } from './purchase/purchase.controller'
import { UsersModule } from '../users/users.module'
import { PaymentsController } from './payments/payments.controller';

@Module({
  providers: [StripeService],
  controllers: [PurchaseController, PaymentsController],
  imports: [UsersModule],
})
export class PaymentsModule {}
