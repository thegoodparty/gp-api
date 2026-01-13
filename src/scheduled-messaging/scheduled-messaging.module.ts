import { Module } from '@nestjs/common'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { EmailModule } from '../email/email.module'
import { ScheduledMessagingService } from './scheduled-messaging.service'

@Module({
  imports: [EmailModule, SlackModule],
  providers: [ScheduledMessagingService],
  exports: [ScheduledMessagingService],
})
export class ScheduledMessagingModule {}
