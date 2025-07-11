import { Module } from '@nestjs/common'
import { HubspotService } from './hubspot.service'
import { HttpModule } from '@nestjs/axios'
import { CrmController } from './crm.controller'

@Module({
  providers: [HubspotService],
  imports: [HttpModule],
  exports: [HubspotService],
  controllers: [CrmController],
})
export class CrmModule {}
