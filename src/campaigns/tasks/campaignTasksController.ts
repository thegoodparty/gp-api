import { Controller, Get } from '@nestjs/common'
import { CampaignTasksService } from './campaignTasksService'

@Controller('campaigns/tasks')
export class CampaignTasksController {
  constructor(private readonly tasksService: CampaignTasksService) {}

  @Get()
  listCampaignTasks() {
    return this.tasksService.listCampaignTasks()
  }
}
