import { Module } from '@nestjs/common'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ContactsSegmentController } from './contactsSegment.controller'
import { ContactsSegmentService } from './contactsSegment.service'

@Module({
  imports: [CampaignsModule],
  controllers: [ContactsSegmentController],
  providers: [ContactsSegmentService],
  exports: [ContactsSegmentService],
})
export class ContactsSegmentModule {}
