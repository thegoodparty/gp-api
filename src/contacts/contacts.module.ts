import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { VotersModule } from 'src/voters/voters.module'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './services/contacts.service'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { PollsModule } from 'src/polls/polls.module'
import { PeopleModule } from 'src/people/people.module'

@Module({
  imports: [
    HttpModule,
    CampaignsModule,
    VotersModule,
    ElectionsModule,
    SlackModule,
    PollsModule,
    PeopleModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
