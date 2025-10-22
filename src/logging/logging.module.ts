import { Module, Global } from '@nestjs/common'
import { RequestContextService } from './request-context.service'
import { CustomWinstonLogger } from './winston-logger.service'

@Global()
@Module({
  providers: [RequestContextService, CustomWinstonLogger],
  exports: [RequestContextService, CustomWinstonLogger],
})
export class LoggingModule {}
