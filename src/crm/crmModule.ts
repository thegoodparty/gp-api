import { forwardRef, Module } from '@nestjs/common'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { UsersModule } from '../users/users.module'
import { HubspotService } from './hubspot.service'
import { HttpModule } from '@nestjs/axios'
import { FullStoryModule } from '../fullStory/fullStory.module'
import { CrmController } from './crm.controller'

@Module({
  providers: [HubspotService],
  imports: [
    forwardRef(() => CampaignsModule),
    forwardRef(() => UsersModule),
    forwardRef(() => FullStoryModule),
    HttpModule,
  ],
  exports: [HubspotService],
  controllers: [CrmController],
})
export class CrmModule {}
