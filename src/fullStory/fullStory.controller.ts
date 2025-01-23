import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common'
import { FullStoryService } from './fullStory.service'
import { CampaignWith } from '../campaigns/campaigns.types'
import { CampaignsService } from '../campaigns/services/campaigns.service'

@Controller('integrations')
export class FullStoryController {
  constructor(
    private readonly fullstory: FullStoryService,
    private readonly campaigns: CampaignsService,
  ) {}

  @Get('fullstory-sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async syncFullStoryUsers() {
    // No need for await here to return immediately
    this.fullstory.trackCampaigns(
      (await this.campaigns.findAll({
        include: { pathToVictory: true },
      })) as CampaignWith<'pathToVictory'>[],
    )
  }
}
