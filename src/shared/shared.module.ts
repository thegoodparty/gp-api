import { Global, Module } from '@nestjs/common'
import { SlackService } from './services/slack.service'

@Global()
@Module({
  providers: [SlackService],
  exports: [SlackService],
})
export class SharedModule {}
