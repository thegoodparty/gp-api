import { forwardRef, Module } from '@nestjs/common'
import { CrmCampaignsService } from './crmCampaigns.service'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { UsersModule } from '../users/users.module'
import { VotersModule } from '../voters/voters.module'
import { HubspotService } from './hubspot.service'
import { HttpModule } from '@nestjs/axios'
import { FullStoryModule } from '../fullStory/fullStory.module'
import { CrmController } from './crm.controller'

@Module({
  providers: [CrmCampaignsService, HubspotService],
  imports: [
    forwardRef(() => CampaignsModule),
    forwardRef(() => VotersModule),
    forwardRef(() => UsersModule),
    HttpModule,
    forwardRef(() => FullStoryModule),
  ],
  exports: [CrmCampaignsService, HubspotService],
  controllers: [CrmController],
})
export class CrmModule {}
