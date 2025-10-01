import { Module } from '@nestjs/common'
import { StripeService } from './services/stripe.service'
import { SharedModule } from 'src/shared/shared.module'
import { SlackModule } from 'src/vendors/slack/slack.module'

@Module({
  imports: [SharedModule, SlackModule],
  exports: [StripeService],
  providers: [StripeService],
})
export class StripeModule {}
