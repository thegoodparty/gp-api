import { forwardRef, Module } from '@nestjs/common'
import { VoterFileController } from './voterFile/voterFile.controller'
import { VoterFileService } from './voterFile/voterFile.service'
import { CampaignsModule } from 'src/campaigns/campaigns.module'
import { VoterDatabaseService } from './services/voterDatabase.service'
import { VoterOutreachService } from './services/voterOutreach.service'
import { FilesModule } from 'src/files/files.module'
import { VotersService } from './services/voters.service'
import { HttpModule } from '@nestjs/axios'
import { CrmModule } from '../crm/crmModule'

@Module({
  imports: [
    forwardRef(() => CampaignsModule),
    FilesModule,
    HttpModule,
    forwardRef(() => CrmModule),
  ],
  controllers: [VoterFileController],
  providers: [
    VoterFileService,
    VoterDatabaseService,
    VoterOutreachService,
    VotersService,
  ],
  exports: [VoterFileService],
})
export class VotersModule {}
