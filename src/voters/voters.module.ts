import { Module } from '@nestjs/common'
import { VoterFileController } from './voterFile/voterFile.controller'
import { VoterFileService } from './voterFile/voterFile.service'
import { VoterDatabaseService } from './services/voterDatabase.service'
import { VoterOutreachService } from './services/voterOutreach.service'
import { FilesModule } from 'src/files/files.module'
import { VotersService } from './services/voters.service'
import { HttpModule } from '@nestjs/axios'
import { VotersController } from './voters.controller'
import { EmailModule } from 'src/email/email.module'
import { OutreachModule } from 'src/outreach/outreach.module'
import { VoterFileFilterService } from './services/voterFileFilter.service'
import { PeerlyModule } from '../peerly/peerly.module'

@Module({
  imports: [FilesModule, HttpModule, EmailModule, OutreachModule, PeerlyModule],
  controllers: [VotersController, VoterFileController],
  providers: [
    VoterFileService,
    VoterDatabaseService,
    VoterOutreachService,
    VotersService,
    VoterFileFilterService,
  ],
  exports: [VoterFileService, VotersService],
})
export class VotersModule {}
