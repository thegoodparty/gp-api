import { Global, Module } from '@nestjs/common'
import { BraintrustService } from './braintrust.service'

@Global()
@Module({
  providers: [BraintrustService],
  exports: [BraintrustService],
})
export class BraintrustModule {}
