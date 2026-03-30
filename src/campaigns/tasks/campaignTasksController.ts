import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  Post,
  Put,
  Sse,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { CampaignTasksService } from './services/campaignTasks.service'
import { ReqCampaign } from '../decorators/ReqCampaign.decorator'
import { UseCampaign } from '../decorators/UseCampaign.decorator'
import { CampaignWithPathToVictory } from '../campaigns.types'

@Controller('campaigns/tasks')
@UseCampaign({ include: { pathToVictory: true } })
export class CampaignTasksController {
  constructor(private readonly tasksService: CampaignTasksService) {}

  @Get()
  listCampaignTasks(@ReqCampaign() campaign: CampaignWithPathToVictory) {
    return this.tasksService.listCampaignTasks(campaign)
  }

  @Put('complete/:id')
  async completeTask(
    @ReqCampaign() campaign: CampaignWithPathToVictory,
    @Param('id') id: string,
  ) {
    return this.tasksService.completeTask(campaign, id)
  }

  @Delete('complete/:id')
  async unCompleteTask(
    @ReqCampaign() campaign: CampaignWithPathToVictory,
    @Param('id') id: string,
  ) {
    return this.tasksService.unCompleteTask(campaign, id)
  }

  // TODO: This is a temporary endpoint to delete all tasks for a campaign for testing purposes
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAllTasks(@ReqCampaign() campaign: CampaignWithPathToVictory) {
    await this.tasksService.deleteAllTasks(campaign.id)
  }

  @Post('generate')
  @HttpCode(HttpStatus.ACCEPTED)
  enqueueGenerateTasks(@ReqCampaign() campaign: CampaignWithPathToVictory) {
    return this.tasksService.enqueueGenerateTasks(campaign)
  }

  @Sse('generate/stream')
  generateTasksStream(
    @ReqCampaign() campaign: CampaignWithPathToVictory,
  ): Observable<MessageEvent> {
    return this.tasksService.generateTasksStream(campaign)
  }
}
