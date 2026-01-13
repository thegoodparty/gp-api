import { Module } from '@nestjs/common'
import { AiModule } from 'src/ai/ai.module'
import { ContentModule } from 'src/content/content.module'
import { QueueProducerModule } from 'src/queue/producer/queueProducer.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { AiService } from '../../ai/ai.service'
import { AiChatController } from './chat/aiChat.controller'
import { AiChatService } from './chat/aiChat.service'
import { AiContentController } from './content/aiContent.controller'
import { AiContentService } from './content/aiContent.service'

@Module({
  imports: [ContentModule, AiModule, QueueProducerModule, SlackModule],
  controllers: [AiContentController, AiChatController],
  providers: [AiContentService, AiChatService, AiService],
  exports: [AiContentService, AiChatService],
})
export class CampaignsAiModule {}
