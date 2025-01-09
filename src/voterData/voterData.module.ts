import { Module } from '@nestjs/common'
import { VoterFileController } from './voterFile/voterFile.controller'
import { VoterFileService } from './voterFile/voterFile.service'
import { CampaignsModule } from 'src/campaigns/campaigns.module'

@Module({
  imports: [CampaignsModule],
  controllers: [VoterFileController],
  providers: [VoterFileService],
})
export class VoterDataModule {}
