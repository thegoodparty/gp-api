import { Module } from '@nestjs/common'
import { CrmCampaignsService } from './crmCampaigns.service'
import { CrmUsersService } from './crmUsers.service'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { UsersModule } from '../users/users.module'
import { VotersModule } from '../voters/voters.module'
import { HubspotService } from './hubspot.service'

@Module({
  providers: [CrmUsersService, CrmCampaignsService, HubspotService],
  imports: [CampaignsModule, VotersModule, UsersModule],
  exports: [CrmUsersService, CrmCampaignsService],
})
export class CrmModule {}
