import { Module } from '@nestjs/common'
import { StripeService } from './services/stripe.service'

@Module({
  exports: [StripeService],
  providers: [StripeService],
})
export class StripeModule {}
