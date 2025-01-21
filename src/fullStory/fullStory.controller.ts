import { Controller, Get } from '@nestjs/common'
import { FullStoryService } from './fullStory.service'

@Controller('integrations')
export class FullStoryController {
  constructor(private readonly fullstory: FullStoryService) {}

  @Get('fullstory-sync')
  async syncFullStoryUsers() {
    return 'FullStory users synced'
  }
}
