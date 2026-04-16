import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { HttpModule } from '@nestjs/axios'
import { forwardRef, Module } from '@nestjs/common'
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
    forwardRef(() => CampaignsModule),
    VotersModule,
    ElectionsModule,
    OrganizationsModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
