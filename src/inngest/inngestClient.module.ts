import { Global, Module } from '@nestjs/common'
import { InngestService } from './services/inngest.service'

@Global()
@Module({
  providers: [InngestService],
  exports: [InngestService],
})
export class InngestClientModule {}
