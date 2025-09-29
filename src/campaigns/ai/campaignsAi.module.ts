import { Module } from '@nestjs/common'
import { AiContentService } from './content/aiContent.service'
import { AiContentController } from './content/aiContent.controller'
import { ContentModule } from 'src/content/content.module'
import { AiModule } from 'src/ai/ai.module'
import { QueueProducerModule } from 'src/queue/producer/queueProducer.module'
import { AiChatController } from './chat/aiChat.controller'
import { AiChatService } from './chat/aiChat.service'
import { AiService } from '../../ai/ai.service'
import { SlackModule } from 'src/vendors/slack/slack.module'

@Module({
  imports: [ContentModule, AiModule, QueueProducerModule, SlackModule],
  controllers: [AiContentController, AiChatController],
  providers: [AiContentService, AiChatService, AiService],
  exports: [AiContentService, AiChatService],
})
export class CampaignsAiModule {}
