import { Module } from '@nestjs/common'
import { AiModule } from '@/ai/ai.module'
import { ContactsModule } from '@/contacts/contacts.module'
import { OnboardingContactsController } from './onboardingContacts.controller'
import { OnboardingLocalNewsController } from './onboardingLocalNews.controller'
import { OnboardingLocalNewsService } from './services/localNews.service'

@Module({
  imports: [AiModule, ContactsModule],
  controllers: [OnboardingContactsController, OnboardingLocalNewsController],
  providers: [OnboardingLocalNewsService],
})
export class OnboardingModule {}
