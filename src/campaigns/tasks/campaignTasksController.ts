import { Controller, Get, ParseDatePipe, Query } from '@nestjs/common'
import { CampaignTasksService } from './campaignTasksService'
import { ReqCampaign } from '../decorators/ReqCampaign.decorator'
import { Campaign } from '@prisma/client'
import { UseCampaign } from '../decorators/UseCampaign.decorator'

@Controller('campaigns/tasks')
@UseCampaign()
export class CampaignTasksController {
  constructor(private readonly tasksService: CampaignTasksService) {}

  @Get()
  listCampaignTasks(
    @ReqCampaign() campaign: Campaign,
    @Query('date', new ParseDatePipe({ optional: true })) date?: Date,
    @Query('endDate', new ParseDatePipe({ optional: true })) endDate?: Date,
  ) {
    return this.tasksService.listCampaignTasks(campaign, date, endDate)
  }
}
