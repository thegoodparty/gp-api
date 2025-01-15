import { Module } from '@nestjs/common'
import { ErrorLoggerController } from './error-logger.controller'

@Module({
  controllers: [ErrorLoggerController],
})
export class ErrorLoggerModule {}
