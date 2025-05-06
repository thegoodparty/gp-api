import { Module } from '@nestjs/common'
import { ScheduledMessagingService } from './scheduled-messaging.service'
import { EmailModule } from '../email/email.module'

@Module({
  imports: [EmailModule],
  providers: [ScheduledMessagingService],
  exports: [ScheduledMessagingService],
})
export class ScheduledMessagingModule {}
