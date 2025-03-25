import { Injectable } from '@nestjs/common'
import { STATIC_CAMPAIGN_TASKS } from './campaignTasks.consts'

console.log(`STATIC_CAMPAIGN_TASKS =>`, STATIC_CAMPAIGN_TASKS)

@Injectable()
export class CampaignTasksService {
  listCampaignTasks() {
    return STATIC_CAMPAIGN_TASKS
  }
}
