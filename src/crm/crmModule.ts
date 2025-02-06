import { forwardRef, Module } from '@nestjs/common'
import { CrmCampaignsService } from './crmCampaigns.service'
import { CrmUsersService } from './crmUsers.service'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { UsersModule } from '../users/users.module'
import { VotersModule } from '../voters/voters.module'
import { HubspotService } from './hubspot.service'
import { HttpModule } from '@nestjs/axios'
import { FullStoryModule } from '../fullStory/fullStory.module'
import { CrmController } from './crm.controller'

@Module({
  providers: [CrmUsersService, CrmCampaignsService, HubspotService],
  imports: [
    forwardRef(() => CampaignsModule),
    forwardRef(() => VotersModule),
    forwardRef(() => UsersModule),
    HttpModule,
    forwardRef(() => FullStoryModule),
  ],
  exports: [CrmUsersService, CrmCampaignsService],
  controllers: [CrmController],
})
export class CrmModule {}
