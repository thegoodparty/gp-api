import {
  Controller,
  Delete,
  Get,
  Param,
  ParseDatePipe,
  Put,
  Query,
} from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { ReqCampaign } from '../decorators/ReqCampaign.decorator'
import { UseCampaign } from '../decorators/UseCampaign.decorator'
import { CampaignTasksService } from './campaignTasksService'

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

  @Put('complete/:taskId')
  async completeTask(
    @ReqCampaign() campaign: Campaign,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.completeTask(campaign, taskId)
  }

  @Delete('complete/:taskId')
  async unCompleteTask(
    @ReqCampaign() campaign: Campaign,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.unCompleteTask(campaign, taskId)
  }
}
