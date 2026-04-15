import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  Put,
  Sse,
} from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { Observable } from 'rxjs'
import { CampaignTasksService } from './services/campaignTasks.service'
import { ReqCampaign } from '../decorators/ReqCampaign.decorator'
import { UseCampaign } from '../decorators/UseCampaign.decorator'
import { completeTaskBodySchema } from './schemas/completeTaskBody.schema'

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
    @Body() body?: Record<string, unknown>,
  ) {
    const voterContact =
      body && Object.keys(body).length > 0
        ? completeTaskBodySchema.parse(body)
        : undefined
    return this.tasksService.completeTask(campaign, id, voterContact)
  }

  @Delete('complete/:id')
  async unCompleteTask(
    @ReqCampaign() campaign: Campaign,
    @Param('id') id: string,
  ) {
    return this.tasksService.unCompleteTask(campaign, id)
  }

  // TODO: This is a temporary endpoint to delete all tasks for a campaign for testing purposes
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAllTasks(@ReqCampaign() campaign: Campaign) {
    await this.tasksService.deleteAllTasks(campaign.id)
  }

  @Sse('generate/stream')
  generateTasksStream(
    @ReqCampaign() campaign: Campaign,
  ): Observable<MessageEvent> {
    return this.tasksService.generateTasksStream(campaign)
  }
}
