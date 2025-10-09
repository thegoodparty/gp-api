import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { VotersModule } from 'src/voters/voters.module'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './services/contacts.service'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { PollsService } from 'src/polls/services/polls.service'

@Module({
  imports: [
    HttpModule,
    CampaignsModule,
    VotersModule,
    ElectionsModule,
    SlackModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService, PollsService],
  exports: [ContactsService],
})
export class ContactsModule {}
