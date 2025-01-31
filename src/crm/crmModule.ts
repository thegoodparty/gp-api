import { Module } from '@nestjs/common'
import { CrmCampaignsService } from './crmCampaigns.service'
import { CrmUsersService } from './crmUsers.service'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { UsersModule } from '../users/users.module'
import { VotersModule } from '../voters/voters.module'
import { HubspotService } from './hubspot.service'
import { HttpModule } from '@nestjs/axios'

@Module({
  providers: [CrmUsersService, CrmCampaignsService, HubspotService],
  imports: [CampaignsModule, VotersModule, UsersModule, HttpModule],
  exports: [CrmUsersService, CrmCampaignsService],
})
export class CrmModule {}
