import { Module } from '@nestjs/common'
import { HubspotService } from './hubspot.service'
import { HttpModule } from '@nestjs/axios'
import { FullStoryModule } from '../fullStory/fullStory.module'
import { CrmController } from './crm.controller'

@Module({
  providers: [HubspotService],
  imports: [FullStoryModule, HttpModule],
  exports: [HubspotService],
  controllers: [CrmController],
})
export class CrmModule {}
