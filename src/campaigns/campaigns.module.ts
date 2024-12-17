import { Module } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller'
import { CampaignsService } from './campaigns.service'
import { CampaignsAiController } from './ai/campaignsAi.controller'
import { CampaignsAiService } from './ai/campaignsAi.service'
import { ContentModule } from 'src/content/content.module'
import { AiModule } from 'src/ai/ai.module'

@Module({
  imports: [ContentModule, AiModule],
  controllers: [CampaignsController, CampaignsAiController],
  providers: [CampaignsService, CampaignsAiService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
