import { Global, Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { VoterFileDownloadAccessService } from './services/voterFileDownloadAccess.service'
import { ProcessTimersService } from './services/process-timers.service'

@Global()
@Module({
  imports: [HttpModule],
  providers: [VoterFileDownloadAccessService, ProcessTimersService],
  exports: [VoterFileDownloadAccessService, ProcessTimersService],
})
export class SharedModule {}
