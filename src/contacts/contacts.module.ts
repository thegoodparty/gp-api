import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './services/contacts.service'
import { ContactsSegmentModule } from './contactsSegment/contactsSegment.module'

@Module({
  imports: [HttpModule, CampaignsModule, ContactsSegmentModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
