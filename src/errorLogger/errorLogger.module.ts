import { Module } from '@nestjs/common'
import { ErrorLoggerController } from './errorLogger.controller'
import { SlackModule } from 'src/vendors/slack/slack.module'

@Module({
  imports: [SlackModule],
  controllers: [ErrorLoggerController],
})
export class ErrorLoggerModule {}
