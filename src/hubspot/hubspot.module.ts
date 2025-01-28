import { Module } from '@nestjs/common'
import { HubspotService } from './hubspotService/hubspot.service'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { UsersModule } from '../users/users.module'
import { VotersModule } from '../voters/voters.module'

@Module({
  imports: [CampaignsModule, VotersModule, UsersModule],
  providers: [HubspotService],
})
export class HubspotModule {}
