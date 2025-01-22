import { Module } from '@nestjs/common'
import { VoterFileController } from './voterFile/voterFile.controller'
import { VoterFileService } from './voterFile/voterFile.service'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { VoterDataService } from './voterData.service'
import { VoterOutreachService } from './voterOutreach.service'
import { FilesModule } from 'src/files/files.module'

@Module({
  imports: [CampaignsModule, FilesModule],
  controllers: [VoterFileController],
  providers: [VoterFileService, VoterDataService, VoterOutreachService],
  exports: [VoterFileService],
})
export class VoterDataModule {}
