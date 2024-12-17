import { forwardRef, Module } from '@nestjs/common'
import { CampaignsAiService } from './campaignsAi.service'
import { CampaignsAiController } from './campaignsAi.controller'
import { ContentModule } from 'src/content/content.module'
import { AiModule } from 'src/ai/ai.module'
import { CampaignsModule } from '../campaigns.module'

@Module({
  imports: [ContentModule, AiModule, forwardRef(() => CampaignsModule)],
  controllers: [CampaignsAiController],
  providers: [CampaignsAiService],
})
export class CampaignsAiModule {}
