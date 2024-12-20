import { forwardRef, Module } from '@nestjs/common'
import { AiContentService } from './content/aiContent.service'
import { AiContentController } from './content/aiContent.controller'
import { ContentModule } from 'src/content/content.module'
import { AiModule } from 'src/ai/ai.module'
import { CampaignsModule } from '../campaigns.module'
import { QueueProducerModule } from 'src/queue/producer/producer.module'
import { AiChatController } from './chat/aiChat.controller'

@Module({
  imports: [
    ContentModule,
    AiModule,
    QueueProducerModule,
    forwardRef(() => CampaignsModule),
  ],
  controllers: [AiContentController, AiChatController],
  providers: [AiContentService],
  exports: [AiContentService],
})
export class CampaignsAiModule {}
