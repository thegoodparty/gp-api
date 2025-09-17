import { Module } from '@nestjs/common'
import { StripeService } from './services/stripe.service'
import { SharedModule } from 'src/shared/shared.module'

@Module({
  imports: [SharedModule],
  exports: [StripeService],
  providers: [StripeService],
})
export class StripeModule {}
