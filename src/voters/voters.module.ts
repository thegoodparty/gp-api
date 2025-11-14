import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ElectionsModule } from 'src/elections/elections.module'
import { EmailModule } from 'src/email/email.module'
import { FilesModule } from 'src/files/files.module'
import { OutreachModule } from 'src/outreach/outreach.module'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { PeerlyModule } from '../vendors/peerly/peerly.module'
import { VoterDatabaseService } from './services/voterDatabase.service'
import { VoterFileFilterService } from './services/voterFileFilter.service'
import { VoterOutreachService } from './services/voterOutreach.service'
import { VotersService } from './services/voters.service'
import { VoterFileController } from './voterFile/voterFile.controller'
import { VoterFileService } from './voterFile/voterFile.service'
import { VotersController } from './voters.controller'

@Module({
  imports: [
    FilesModule,
    HttpModule,
    EmailModule,
    OutreachModule,
    PeerlyModule,
    SlackModule,
    ElectionsModule,
  ],
  controllers: [VotersController, VoterFileController],
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
