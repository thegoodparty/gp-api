import { Global, Module } from '@nestjs/common'
import { SlackService } from './services/slack.service'
import { HttpModule } from '@nestjs/axios'
import { VoterFileDownloadAccessService } from './services/voterFileDownloadAccess.service'
import { ProcessTimersService } from './services/process-timers.service'

@Global()
@Module({
  imports: [HttpModule],
  providers: [
    SlackService,
    VoterFileDownloadAccessService,
    ProcessTimersService,
  ],
  exports: [SlackService, VoterFileDownloadAccessService, ProcessTimersService],
})
export class SharedModule {}
