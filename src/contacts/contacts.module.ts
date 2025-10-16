import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { VotersModule } from 'src/voters/voters.module'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './services/contacts.service'
import { PollsModule } from 'src/polls/polls.module'

@Module({
  imports: [HttpModule, CampaignsModule, VotersModule, ElectionsModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
