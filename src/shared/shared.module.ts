import { Global, Module } from '@nestjs/common'
import { SlackService } from './services/slack.service'
import { HttpModule } from '@nestjs/axios'
import { VoterFileDownloadAccessService } from './services/voterFileDownloadAccess.service'

@Global()
@Module({
  imports: [HttpModule],
  providers: [SlackService, VoterFileDownloadAccessService],
  exports: [SlackService, VoterFileDownloadAccessService],
})
export class SharedModule {}
