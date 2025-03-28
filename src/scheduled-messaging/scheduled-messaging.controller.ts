// TODO: Delete this file once we're done developing the scheduled messaging system
import { Controller, Get } from '@nestjs/common'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'
import { ScheduledMessagingService } from './scheduled-messaging.service'

@Controller('scheduled-messaging')
export class ScheduledMessagingController {
  constructor(private readonly service: ScheduledMessagingService) {}
  @Get()
  @PublicAccess()
  async pushMessage() {}
}
