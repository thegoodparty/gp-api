import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common'
import { FullStoryService } from './fullStory.service'
import { ReqUser } from '../authentication/decorators/ReqUser.decorator'
import { User } from '@prisma/client'

@Controller('integrations')
export class FullStoryController {
  constructor(private readonly fullstory: FullStoryService) {}

  @Get('fullstory-sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async syncFullStoryUsers(@ReqUser() user: User) {
    // No await here, we don't need to wait for this to finish to just respond with a 202
    this.fullstory.trackUser(user.id)
    return 'FullStory users synced'
  }
}
