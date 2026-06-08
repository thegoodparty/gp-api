import { Module } from '@nestjs/common'
import { LlmModule } from '@/llm/llm.module'
import { ContactsModule } from '@/contacts/contacts.module'
import { ElectionsModule } from '@/elections/elections.module'
import { OrganizationsModule } from '@/organizations/organizations.module'
import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { OnboardingContactsController } from './onboardingContacts.controller'
import { OnboardingLocalNewsController } from './onboardingLocalNews.controller'
import { OnboardingVoterIssuesController } from './onboardingVoterIssues.controller'
import { OnboardingLocalNewsService } from './services/localNews.service'

@Module({
  imports: [
    LlmModule,
    ContactsModule,
    ElectionsModule,
    OrganizationsModule,
    ClerkModule,
  ],
  controllers: [
    OnboardingContactsController,
    OnboardingLocalNewsController,
    OnboardingVoterIssuesController,
  ],
  providers: [OnboardingLocalNewsService],
})
export class OnboardingModule {}
