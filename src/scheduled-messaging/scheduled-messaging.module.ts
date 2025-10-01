import { Module } from '@nestjs/common'
import { ScheduledMessagingService } from './scheduled-messaging.service'
import { EmailModule } from '../email/email.module'
import { SlackModule } from 'src/vendors/slack/slack.module'

@Module({
  imports: [EmailModule, SlackModule],
  providers: [ScheduledMessagingService],
  exports: [ScheduledMessagingService],
})
export class ScheduledMessagingModule {}
