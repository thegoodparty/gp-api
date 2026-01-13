import { Module } from '@nestjs/common'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { ErrorLoggerController } from './errorLogger.controller'

@Module({
  imports: [SlackModule],
  controllers: [ErrorLoggerController],
})
export class ErrorLoggerModule {}
