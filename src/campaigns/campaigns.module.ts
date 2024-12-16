import { Module } from '@nestjs/common'
import { CampaignsController } from './campaigns.controller'
import { CampaignsService } from './campaigns.service'
import { CampaignsAiController } from './ai/campaignsAi.controller'
import { CampaignsAiService } from './ai/campaignsAi.service'
import { ContentModule } from 'src/content/content.module'
import { UsersModule } from 'src/users/users.module'

@Module({
  imports: [ContentModule, UsersModule],
  controllers: [CampaignsController, CampaignsAiController],
  providers: [CampaignsService, CampaignsAiService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
