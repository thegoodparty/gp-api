import { Module } from '@nestjs/common'
import { VoterFileController } from './voterFile/voterFile.controller'
import { VoterFileService } from './voterFile/voterFile.service'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { VoterDataService } from './voterData.service'

@Module({
  imports: [CampaignsModule],
  controllers: [VoterFileController],
  providers: [VoterFileService, VoterDataService],
  exports: [VoterFileService],
})
export class VoterDataModule {}
