import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { CrmController } from './crm.controller'
import { HubspotService } from './hubspot.service'

@Module({
  providers: [HubspotService],
  imports: [HttpModule, SlackModule],
  exports: [HubspotService],
  controllers: [CrmController],
})
export class CrmModule {}
