import { Module } from '@nestjs/common'
import { SubscribeService } from './subscribe.service'
import { SubscribeController } from './subscribe.controller'
import { CrmModule } from '../crm/crmModule'

@Module({
  imports: [CrmModule],
  controllers: [SubscribeController],
  providers: [SubscribeService],
  exports: [SubscribeService],
})
export class SubscribeModule {}
