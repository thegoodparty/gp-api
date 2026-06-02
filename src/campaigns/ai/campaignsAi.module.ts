import { Module } from '@nestjs/common'
import { AiContentService } from './content/aiContent.service'
import { AiContentController } from './content/aiContent.controller'
import { ContentModule } from 'src/content/content.module'
import { AiModule } from 'src/ai/ai.module'
import { LlmModule } from '@/llm/llm.module'
import { QueueProducerModule } from 'src/queue/producer/queueProducer.module'
import { AiChatController } from './chat/aiChat.controller'
import { AiChatService } from './chat/aiChat.service'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { OrganizationsModule } from '@/organizations/organizations.module'
import { ClerkModule } from '@/vendors/clerk/clerk.module'

@Module({
  imports: [
    ContentModule,
    AiModule,
    LlmModule,
    ClerkModule,
    QueueProducerModule,
    SlackModule,
    OrganizationsModule,
  ],
  controllers: [AiContentController, AiChatController],
  providers: [AiContentService, AiChatService],
  exports: [AiContentService, AiChatService],
})
export class CampaignsAiModule {}
