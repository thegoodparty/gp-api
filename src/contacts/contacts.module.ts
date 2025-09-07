import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './contacts.service'

@Module({
  imports: [HttpModule, CampaignsModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
