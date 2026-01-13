import { HttpModule } from '@nestjs/axios'
import { Global, Module } from '@nestjs/common'
import { ProcessTimersService } from './services/process-timers.service'
import { VoterFileDownloadAccessService } from './services/voterFileDownloadAccess.service'

@Global()
@Module({
  imports: [HttpModule],
  providers: [VoterFileDownloadAccessService, ProcessTimersService],
  exports: [VoterFileDownloadAccessService, ProcessTimersService],
})
export class SharedModule {}
