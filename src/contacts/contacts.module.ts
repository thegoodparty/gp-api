import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { ElectedOfficeModule } from '@/electedOffice/electedOffice.module'
import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { ElectionsModule } from 'src/elections/elections.module'
import { OrganizationsModule } from 'src/organizations/organizations.module'
import { VotersModule } from 'src/voters/voters.module'
import { ContactsController } from './contacts.controller'
import { ContactsService } from './services/contacts.service'

@Module({
  imports: [
    ClerkModule,
    HttpModule,
    CampaignsModule,
    VotersModule,
    ElectionsModule,
    ElectedOfficeModule,
    OrganizationsModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
