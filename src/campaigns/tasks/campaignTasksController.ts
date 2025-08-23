import {
  Controller,
  Delete,
  Get,
  Param,
  ParseDatePipe,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { CampaignTasksService } from './services/campaignTasks.service'
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

  @Put('complete/:id')
  async completeTask(
    @ReqCampaign() campaign: Campaign,
    @Param('id') id: string,
  ) {
    return this.tasksService.completeTask(campaign, parseInt(id))
  }

  @Delete('complete/:id')
  async unCompleteTask(
    @ReqCampaign() campaign: Campaign,
    @Param('id') id: string,
  ) {
    return this.tasksService.unCompleteTask(campaign, parseInt(id))
  }

  @Post('generate')
  async generateTasks(@ReqCampaign() campaign: Campaign) {
    return this.tasksService.generateTasks(campaign)
  }
}
