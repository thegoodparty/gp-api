import { Module } from '@nestjs/common'
import { AiModule } from '@/ai/ai.module'
import { OnboardingLocalNewsController } from './onboardingLocalNews.controller'
import { OnboardingLocalNewsService } from './services/localNews.service'

@Module({
  imports: [AiModule],
  controllers: [OnboardingLocalNewsController],
  providers: [OnboardingLocalNewsService],
})
export class OnboardingModule {}
