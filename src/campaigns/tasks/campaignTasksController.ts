import { Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { CampaignTasksService } from './services/campaignTasks.service'
import { ReqCampaign } from '../decorators/ReqCampaign.decorator'
import { Campaign } from '@prisma/client'
import { UseCampaign } from '../decorators/UseCampaign.decorator'

@Controller('campaigns/tasks')
@UseCampaign()
export class CampaignTasksController {
  constructor(private readonly tasksService: CampaignTasksService) {}

  @Get()
  listCampaignTasks(@ReqCampaign() campaign: Campaign) {
    return this.tasksService.listCampaignTasks(campaign)
  }

  @Put('complete/:id')
  async completeTask(
    @ReqCampaign() campaign: Campaign,
    @Param('id') id: string,
  ) {
    return this.tasksService.completeTask(campaign, id)
  }

  @Delete('complete/:id')
  async unCompleteTask(
    @ReqCampaign() campaign: Campaign,
    @Param('id') id: string,
  ) {
    return this.tasksService.unCompleteTask(campaign, id)
  }

  @Post('generate')
  async generateTasks(@ReqCampaign() campaign: Campaign) {
    return this.tasksService.generateTasks(campaign)
  }
}
