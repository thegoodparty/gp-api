import { Module } from '@nestjs/common'
import { ErrorLoggerController } from './errorLogger.controller'

@Module({
  controllers: [ErrorLoggerController],
})
export class ErrorLoggerModule {}
