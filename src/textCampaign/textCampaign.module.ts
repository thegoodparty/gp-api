import { forwardRef, Module } from '@nestjs/common'
import { TextCampaignController } from './textCampaign.controller'
import { TextCampaignService } from './services/textCampaign.service'
import { RumbleUpService } from './services/rumbleUp.service'
import { HttpModule } from '@nestjs/axios'
import { CampaignsModule } from '../campaigns/campaigns.module'
import { EmailModule } from 'src/email/email.module'

@Module({
  imports: [forwardRef(() => CampaignsModule), HttpModule, EmailModule],
  controllers: [TextCampaignController],
  providers: [TextCampaignService, RumbleUpService],
  exports: [TextCampaignService],
})
export class TextCampaignModule {}
