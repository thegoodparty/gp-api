import { Module } from '@nestjs/common'
import { HubspotService } from './hubspot.service'
import { HttpModule } from '@nestjs/axios'
import { AnalyticsModule } from '../analytics/analytics.module'
import { CrmController } from './crm.controller'

@Module({
  providers: [HubspotService],
  imports: [AnalyticsModule, HttpModule],
  exports: [HubspotService],
  controllers: [CrmController],
})
export class CrmModule {}
