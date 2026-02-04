import { ElectedOfficeModule } from '@/electedOffice/electedOffice.module'
import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { VotersModule } from 'src/voters/voters.module'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './services/contacts.service'
import { PollsModule } from '@/polls/polls.module'

@Module({
  imports: [
    HttpModule,
    CampaignsModule,
    VotersModule,
    ElectionsModule,
    ElectedOfficeModule,
    PollsModule,
    ElectedOfficeModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
