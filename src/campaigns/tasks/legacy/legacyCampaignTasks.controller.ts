import {
  Controller,
  Delete,
  Get,
  Param,
  ParseDatePipe,
  Put,
  Query,
} from '@nestjs/common'
import { LegacyCampaignTasksService } from './services/legacyCampaignTasks.service'
import { ReqCampaign } from '../../decorators/ReqCampaign.decorator'
import { Campaign } from '@prisma/client'
import { UseCampaign } from '../../decorators/UseCampaign.decorator'

@Controller('campaigns/legacy-tasks')
@UseCampaign()
export class LegacyCampaignTasksController {
  constructor(private readonly tasksService: LegacyCampaignTasksService) {}

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
