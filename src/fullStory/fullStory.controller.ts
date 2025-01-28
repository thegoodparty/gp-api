import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common'
import { FullStoryService } from './fullStory.service'

@Controller('integrations')
export class FullStoryController {
  constructor(private readonly fullstory: FullStoryService) {}

  @Get('fullstory-sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async syncFullStoryUsers() {
    // No need for await here to return immediately
    this.fullstory.trackCampaigns()
  }
}
