import { Controller, Get } from '@nestjs/common'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'
import { ScheduledMessagingService } from './scheduled-messaging.service'
import { ScheduledMessageTypes } from '../email/email.types'
import { addSeconds } from 'date-fns'

@Controller('scheduled-messaging')
export class ScheduledMessagingController {
  constructor(private readonly service: ScheduledMessagingService) {}
  @Get()
  @PublicAccess()
  async pushMessage() {
    this.service.scheduleMessage(
      1,
      {
        type: ScheduledMessageTypes.EMAIL,
        message: {
          to: 'matthew@goodparty.org',
          subject: 'Test',
          message: 'Testing scheduled messaging',
        },
      },
      addSeconds(new Date(), 10),
    )
  }
}
