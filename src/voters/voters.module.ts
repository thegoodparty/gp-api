import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { FilesModule } from 'src/files/files.module'
import { OrganizationsModule } from 'src/organizations/organizations.module'
import { OutreachModule } from 'src/outreach/outreach.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { ElectedOfficeModule } from '../electedOffice/electedOffice.module'
import { PeerlyModule } from '../vendors/peerly/peerly.module'
import { VoterDatabaseService } from './services/voterDatabase.service'
import { VoterFileFilterService } from './services/voterFileFilter.service'
import { VoterOutreachService } from './services/voterOutreach.service'
import { VotersService } from './services/voters.service'
import { VoterFileController } from './voterFile/voterFile.controller'
import { VoterFileService } from './voterFile/voterFile.service'

@Module({
  imports: [
    FilesModule,
    HttpModule,
    OrganizationsModule,
    OutreachModule,
    PeerlyModule,
    SlackModule,
    ElectedOfficeModule,
  ],
  controllers: [VoterFileController],
  providers: [
    VoterFileService,
    VoterDatabaseService,
    VoterOutreachService,
    VotersService,
    VoterFileFilterService,
  ],
  exports: [
    VoterFileService,
    VotersService,
    VoterFileFilterService,
    VoterDatabaseService,
  ],
})
export class VotersModule {}
