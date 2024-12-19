import { forwardRef, Module } from '@nestjs/common'
import { CampaignsAiService } from './campaignsAi.service'
import { CampaignsAiController } from './campaignsAi.controller'
import { ContentModule } from 'src/content/content.module'
import { AiModule } from 'src/ai/ai.module'
import { CampaignsModule } from '../campaigns.module'
import { QueueProducerModule } from 'src/queue/producer/producer.module'

@Module({
  imports: [
    ContentModule,
    AiModule,
    QueueProducerModule,
    forwardRef(() => CampaignsModule),
  ],
  controllers: [CampaignsAiController],
  providers: [CampaignsAiService],
  exports: [CampaignsAiService],
})
export class CampaignsAiModule {}
