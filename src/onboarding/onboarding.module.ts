import { Module } from '@nestjs/common'
import { AiModule } from '@/ai/ai.module'
import { ContactsModule } from '@/contacts/contacts.module'
import { ElectionsModule } from '@/elections/elections.module'
import { OnboardingContactsController } from './onboardingContacts.controller'
import { OnboardingLocalNewsController } from './onboardingLocalNews.controller'
import { OnboardingContactsService } from './services/onboardingContacts.service'
import { OnboardingLocalNewsService } from './services/localNews.service'

@Module({
  imports: [AiModule, ContactsModule, ElectionsModule],
  controllers: [OnboardingContactsController, OnboardingLocalNewsController],
  providers: [OnboardingContactsService, OnboardingLocalNewsService],
})
export class OnboardingModule {}
