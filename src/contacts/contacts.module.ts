import { ElectedOfficeModule } from '@/electedOffice/electedOffice.module'
import { Agent as HttpsAgent } from 'node:https'
import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { VotersModule } from 'src/voters/voters.module'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './services/contacts.service'

@Module({
  imports: [
    HttpModule.register({
      httpsAgent: new HttpsAgent({ keepAlive: true }),
    }),
    CampaignsModule,
    VotersModule,
    ElectionsModule,
    ElectedOfficeModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
