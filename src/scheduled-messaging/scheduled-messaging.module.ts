import { Module } from '@nestjs/common'
import { ScheduledMessagingController } from './scheduled-messaging.controller'
import { ScheduledMessagingService } from './scheduled-messaging.service'

@Module({
  controllers: [ScheduledMessagingController],
  providers: [ScheduledMessagingService],
  exports: [ScheduledMessagingService],
})
export class ScheduledMessagingModule {}
