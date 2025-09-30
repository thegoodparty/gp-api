import { Module } from '@nestjs/common'
import { HubspotService } from './hubspot.service'
import { HttpModule } from '@nestjs/axios'
import { CrmController } from './crm.controller'
import { SlackModule } from 'src/vendors/slack/slack.module'

@Module({
  providers: [HubspotService],
  imports: [HttpModule, SlackModule],
  exports: [HubspotService],
  controllers: [CrmController],
})
export class CrmModule {}
